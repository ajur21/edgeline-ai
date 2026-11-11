/* ==========================================================================
   EdgeLine AI — the NFL game model (2026-11-08; owner: "I also want to work on NFL picks")
   Football information from nflverse (github.com/nflverse/nflverse-data, CC BY 4.0), game data only, never a price:
   - an opponent-adjusted margin rating per team (a ridge fit of this season's results, home edge out, starting from
     60% of last season's rating weighted as 14 games);
   - an opponent-adjusted offensive EPA per play (the same fit on each team-game's expected points added per play,
     starting from 90% of last season's weighted as 3 games; the defensive side earned almost no weight);
   - the starting quarterback against the quarterback play the team's numbers were built on: each QB's passing EPA per
     dropback over his career (older seasons at 0.8 a year, shrunk toward -0.10 by 400 dropbacks, so a backup with
     little history reads as replacement level), times 36 dropbacks a game;
   - the home edge only at a home ground (international and neutral games get none) and the rest difference.
   expected margin = 2.146 home + 0.985 rating gap + 0.19 x 62 x EPA gap + 0.824 x 36 x QB gap + 0.152 x rest gap
   (ordinary least squares on 2008-2025 regular seasons, 4,398 games). Fitted on earlier seasons and scored on later
   ones (rolling origin, 2012-2026): held-out moneyline log-loss 0.6234 against 0.6334 for the old margin model and
   0.6094 for the closing line, which the model never sees (see CLAUDE.md, "NFL model (2026-11-08)").
   The margin's own error (`marginSd`, the bar's input) is the ridge posterior's: the standard deviation of the rating
   gap and the EPA gap at their weights.
   Data: one GitHub release download a week (schedules, team-week and player-week stats), cached in data/nflverse.json;
   when it fails and no cache exists, the pipeline keeps the old margin model (scripts/model.js) for the NFL.
   ========================================================================== */
"use strict";
const fs = require("fs"), path = require("path"), zlib = require("zlib");

const RELEASE = "https://github.com/nflverse/nflverse-data/releases/download";
const ATTRIBUTION = "NFL schedules, results, EPA and starting quarterbacks from nflverse (github.com/nflverse/nflverse-data), CC BY 4.0";
/* the fit (2026-11-08, regular seasons 2008-2025; ratings tuned on 2008-2017 only, scored on 2018-2026) */
const PARAMS = { H: 2.0, sM: 13.5, kM: 14, cM: 0.6, sE: 1.45, plays: 62, homeEPA: 0.02, kO: 3, cO: 0.9, kD: 40, cD: 0.1, qbDecay: 0.8, qbM: 400, qbPrior: -0.1, kQref: 8, dropbacks: 36 };
const BETA = { home: 2.146, rating: 0.985, epa: 0.19, qb: 0.824, rest: 0.152 };
const SEASONS = { games: 5, epa: 2, qb: 10 }; /* how many seasons of each the cache keeps, the current one included */
/* ESPN's abbreviations where nflverse's differ (the odds feed and ESPN reach this module through ESPN's scoreboard) */
const FROM_ESPN = { WSH: "WAS", LAR: "LA", JAC: "JAX" };
const SEVERE = /^(out|injured reserve|ir|doubtful|suspended|season)/i;

/* ---------- small helpers ---------- */
const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
const r1 = n => Math.round(n * 10) / 10, r3 = n => Math.round(n * 1000) / 1000;
const etDay = ms => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
/* the NFL season a date belongs to: the year it started (January and February belong to the season before) */
function seasonOf(ms) { const d = new Date(ms); return d.getUTCMonth() + 1 >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1; }
function parseCsv(text) {
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; continue; }
    if (c === '"') q = true; else if (c === ",") { row.push(f); f = ""; } else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; } else if (c !== "\r") f += c;
  }
  if (f.length || row.length) { row.push(f); rows.push(row); }
  const head = rows.shift() || [];
  return rows.filter(r => r.length > 1).map(r => { const o = {}; head.forEach((h, i) => { o[h] = r[i]; }); return o; });
}
const num = s => s === "" || s == null ? null : Number(s);
/* franchises that moved keep one code (nflverse's stats use the current ones) */
const FRANCHISE = { STL: "LA", SD: "LAC", OAK: "LV" };
const team = t => FRANCHISE[t] || t;
const normName = s => String(s || "").toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, "").replace(/[^a-z]/g, "");

/* ---------- linear algebra: a Gaussian (ridge) posterior over team effects ---------- */
function chol(A) { const n = A.length, L = A.map(() => new Float64Array(n)); for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) { let s = A[i][j]; for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k]; if (i === j) L[i][i] = Math.sqrt(Math.max(s, 1e-12)); else L[i][j] = s / L[j][j]; } return L; }
function cholSolve(L, b) { const n = b.length, y = new Float64Array(n), x = new Float64Array(n); for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i][k] * y[k]; y[i] = s / L[i][i]; } for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k]; x[i] = s / L[i][i]; } return x; }
/* obs: [{ idx: [[i, coef], ...], y, w }], noise variance s2 / w; prior mean m0, prior variance v0. { m, L } */
function ridge(nv, obs, s2, m0, v0) {
  const A = Array.from({ length: nv }, () => new Float64Array(nv)), b = new Float64Array(nv);
  for (let i = 0; i < nv; i++) { A[i][i] = 1 / v0[i]; b[i] = m0[i] / v0[i]; }
  for (const o of obs) { const w = o.w / s2; for (const [i, ci] of o.idx) { b[i] += w * ci * o.y; for (const [j, cj] of o.idx) A[i][j] += w * ci * cj; } }
  const L = chol(A); return { m: cholSolve(L, b), L: L };
}
/* the posterior variance of a contrast vector v (v' A^-1 v) */
function contrastVar(post, v) { const x = cholSolve(post.L, v); let s = 0; for (let i = 0; i < v.length; i++) s += v[i] * x[i]; return s; }

/* ---------- the cache: nflverse's release files reduced to what the model reads ---------- */
/* fetcher(name) -> Buffer of the release file (e.g. "schedules/games.csv.gz"); throws when it cannot be read */
async function build(fetcher, now, prev) {
  const cur = seasonOf(now.getTime());
  const gz = async name => { const buf = await fetcher(name); return parseCsv((/\.gz$/.test(name) ? zlib.gunzipSync(buf) : buf).toString("utf8")); };
  const optional = async name => { try { return await gz(name); } catch (e) { return []; } }; /* a season nflverse has not started yet */
  const sched = await gz("schedules/games.csv.gz");
  const games = sched.filter(g => g.game_type === "REG" && Number(g.season) > cur - SEASONS.games && Number(g.season) <= cur).map(g => [g.game_id, Number(g.season), Number(g.week), g.gameday, team(g.home_team), team(g.away_team), num(g.home_score), num(g.away_score), g.location === "Neutral" ? 1 : 0, num(g.home_rest), num(g.away_rest), g.home_qb_id || null, g.away_qb_id || null, g.home_qb_name || null, g.away_qb_name || null]);
  const epa = {};
  for (let y = cur - SEASONS.epa + 1; y <= cur; y++) (await optional("stats_team/stats_team_week_" + y + ".csv.gz")).forEach(r => {
    if (r.season_type && r.season_type !== "REG") return;
    const plays = (+r.attempts) + (+r.sacks_suffered) + (+r.carries); if (!(plays > 0)) return;
    epa[r.game_id + "|" + team(r.team)] = [plays, r3((num(r.passing_epa) || 0) + (num(r.rushing_epa) || 0))];
  });
  /* QB seasons: a finished season never changes, so the cache keeps it and only the current season (and any season it
     lacks) is downloaded again */
  const qbs = {}, have = (prev && prev.v === 1 && prev.qbSeasons) || [];
  const keep = s => s < cur && have.indexOf(s) !== -1;
  if (prev && prev.qbs) Object.keys(prev.qbs).forEach(id => { const o = prev.qbs[id], s = {}; Object.keys(o.s).forEach(k => { if (keep(Number(k))) s[k] = o.s[k]; }); if (Object.keys(s).length) qbs[id] = { n: o.n, s: s }; });
  const mix = {}, qbSeasons = have.filter(keep);
  let unread = 0; /* past seasons that could not be read: the cache is used, and read again after 12 hours */
  for (let y = cur - SEASONS.qb + 1; y <= cur; y++) {
    if (keep(y) && !(y === cur - 1 && !(prev && prev.mixSeason === y))) continue;
    const rows = await optional("stats_player/stats_player_week_" + y + ".csv.gz");
    if (y < cur && !rows.length) { unread++; continue; }
    /* the three players with the most dropbacks in each team-game, as the fit did (a receiver's trick pass stays out) */
    const byGame = {};
    rows.forEach(r => { const db = (+r.attempts) + (+r.sacks_suffered); if (!(db > 0)) return; (byGame[r.game_id + "|" + team(r.team)] = byGame[r.game_id + "|" + team(r.team)] || []).push({ id: r.player_id, n: r.player_display_name || r.player_name, db: db, epa: num(r.passing_epa) || 0, reg: !r.season_type || r.season_type === "REG" }); });
    Object.keys(byGame).forEach(k => byGame[k].sort((a, b) => b.db - a.db).slice(0, 3).forEach(p => {
      if (!keep(y)) { const q = qbs[p.id] = qbs[p.id] || { n: p.n, s: {} }; const s = q.s[y] = q.s[y] || [0, 0]; s[0] += p.db; s[1] = r3(s[1] + p.epa); }
      if (y === cur - 1 && p.reg) { const t = k.split("|")[1]; const m = mix[t] = mix[t] || {}; m[p.id] = (m[p.id] || 0) + p.db; }
    }));
    if (y < cur && qbSeasons.indexOf(y) === -1) qbSeasons.push(y);
  }
  const mixOut = Object.keys(mix).length ? Object.fromEntries(Object.entries(mix).map(([t, m]) => [t, Object.entries(m)])) : (prev && prev.mixSeason === cur - 1 ? prev.mix : {});
  const done = games.filter(g => g[1] === cur && g[6] != null);
  return { v: 1, source: "nflverse", attribution: ATTRIBUTION, fetchedAt: now.toISOString(), season: cur, games: games, epa: epa, qbs: qbs, qbSeasons: qbSeasons.sort(), mix: mixOut, mixSeason: cur - 1,
    missing: done.filter(g => !epa[g[0] + "|" + g[4]] || !epa[g[0] + "|" + g[5]]).length + unread };
}
/* the weekly refresh: the cache is fresh once it was read after the latest Wednesday 12:00 UTC (every game of the
   week before, Monday night's included, is in nflverse's files by then; the next week's games start on Thursday).
   A cache built while a finished game's stats were still missing is read again after 12 hours. */
function lastBoundary(now) { const d = new Date(now.getTime()); d.setUTCHours(12, 0, 0, 0); while (d.getUTCDay() !== 3 || d.getTime() > now.getTime()) d.setUTCDate(d.getUTCDate() - 1); return d.getTime(); }
function isFresh(state, now) {
  if (!state || state.v !== 1 || !state.fetchedAt || state.season !== seasonOf(now.getTime())) return false;
  const at = Date.parse(state.fetchedAt);
  if (!(at >= lastBoundary(now))) return false;
  return !(state.missing > 0 && now.getTime() - at > 12 * 36e5);
}
/* an honest bot name (the pipeline never poses as a browser): context.js's BOT_UA where it has one */
const UA = (() => { try { return require("./context.js").BOT_UA; } catch (e) { return null; } })() || "EdgeLineAI-data/1.0 (+https://ajur21.github.io/edgeline-ai/)";
const liveFetcher = async name => {
  const res = await fetch(RELEASE + "/" + name, { redirect: "follow", headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error("nflverse " + name + " HTTP " + res.status);
  return Buffer.from(await res.arrayBuffer());
};
/* offline: release files from a fixture folder (a plain CSV is gzipped on the way, as the release serves it) */
function fixtureFetcher(dir) {
  return async name => {
    const base = path.basename(name), plain = base.replace(/\.gz$/, "");
    if (fs.existsSync(path.join(dir, base))) return fs.readFileSync(path.join(dir, base));
    if (fs.existsSync(path.join(dir, plain))) return zlib.gzipSync(fs.readFileSync(path.join(dir, plain)));
    throw new Error("no fixture " + base);
  };
}
/* load the cache, refreshing it when stale; null when nothing can be read (the caller keeps the old model).
   o: { file, now, fetcher (tests: fixture files), log } */
async function load(o) {
  let prev = null;
  try { prev = JSON.parse(fs.readFileSync(o.file, "utf8")); } catch (e) { prev = null; }
  if (isFresh(prev, o.now)) return index(prev);
  try {
    const state = await build(o.fetcher || liveFetcher, o.now, prev);
    try { fs.writeFileSync(o.file, JSON.stringify(state)); } catch (e) { /* a read-only run still uses it */ }
    if (o.log) o.log("nflverse: refreshed (" + state.games.length + " games, " + Object.keys(state.epa).length + " team-games with EPA, " + Object.keys(state.qbs).length + " QBs)");
    return index(state);
  } catch (err) {
    if (o.log) o.log("nflverse: refresh failed (" + err.message + ")" + (prev && prev.season === seasonOf(o.now.getTime()) ? "; using the cache from " + prev.fetchedAt : "; the NFL keeps the old margin model"));
    return prev && prev.v === 1 && prev.season === seasonOf(o.now.getTime()) ? index(prev) : null;
  }
}
/* once per run, and only when an NFL game is modelled */
function lazy(o) { let p = null; return { get: () => (p = p || load(o).catch(() => null)) }; }

/* ---------- the model ---------- */
function index(state) {
  const teams = Array.from(new Set(state.games.map(g => g[4]).concat(state.games.map(g => g[5])))).sort();
  const TI = {}; teams.forEach((t, i) => { TI[t] = i; });
  const games = state.games.map(g => ({ id: g[0], season: g[1], week: g[2], day: g[3], home: g[4], away: g[5], hs: g[6], as: g[7], neutral: !!g[8], hrest: g[9], arest: g[10], hqb: g[11], aqb: g[12], hqbn: g[13], aqbn: g[14] }));
  return { state: state, teams: teams, TI: TI, games: games, priors: {} };
}
/* last season's ratings at its end, chained from the seasons before (margin), or fitted on its own (EPA) */
function priorsFor(ix, season) {
  if (ix.priors[season]) return ix.priors[season];
  const P = PARAMS, NT = ix.teams.length, TI = ix.TI;
  let pm = new Float64Array(NT);
  const first = Math.min.apply(null, ix.games.map(g => g.season));
  for (let s = first; s < season; s++) {
    const fin = ix.games.filter(g => g.season === s && g.hs != null);
    if (fin.length < 200) continue;
    pm = ridge(NT, fin.map(g => ({ idx: [[TI[g.home], 1], [TI[g.away], -1]], y: (g.hs - g.as) - (g.neutral ? 0 : P.H), w: 1 })), P.sM * P.sM, Array.from(pm, x => P.cM * x), new Array(NT).fill(P.sM * P.sM / P.kM)).m;
  }
  const last = ix.games.filter(g => g.season === season - 1 && g.hs != null);
  const eo = epaObs(ix, last), s2 = P.sE * P.sE;
  const pe = eo.length ? ridge(2 * NT + 1, eo, s2, new Array(2 * NT + 1).fill(0), new Array(2 * NT).fill(s2 / (3 * P.plays)).concat([1])).m : new Float64Array(2 * NT + 1);
  return (ix.priors[season] = { margin: pm, off: pe.slice(0, NT), def: pe.slice(NT, 2 * NT), mu: pe[2 * NT] });
}
function epaObs(ix, games, home) {
  const out = [], TI = ix.TI, NT = ix.teams.length, ep = ix.state.epa;
  games.forEach(g => {
    const h = ep[g.id + "|" + g.home], a = ep[g.id + "|" + g.away]; if (!h || !a) return;
    const hh = home && !g.neutral ? 0.5 * PARAMS.homeEPA : 0;
    out.push({ idx: [[TI[g.home], 1], [NT + TI[g.away], 1], [2 * NT, 1]], y: h[1] / h[0] - hh, w: h[0] });
    out.push({ idx: [[TI[g.away], 1], [NT + TI[g.home], 1], [2 * NT, 1]], y: a[1] / a[0] + hh, w: a[0] });
  });
  return out;
}
/* a QB's passing EPA per dropback, shrunk toward replacement level; seasons after `season` are not read */
function qbValue(ix, id, season) {
  const q = id && ix.state.qbs[id]; let db = 0, epa = 0;
  if (q) Object.keys(q.s).forEach(k => { const s = Number(k); if (s > season) return; const w = Math.pow(PARAMS.qbDecay, season - s); db += w * q.s[k][0]; epa += w * q.s[k][1]; });
  return { q: (epa + PARAMS.qbM * PARAMS.qbPrior) / (db + PARAMS.qbM), db: db, name: q ? q.n : null };
}
/* the game as nflverse lists it: the same two clubs within a day of the kickoff */
function findGame(ix, home, away, commenceMs) {
  const day = etDay(commenceMs), t = Date.parse(day + "T12:00:00Z");
  return ix.games.find(g => g.home === home && g.away === away && Math.abs(Date.parse(g.day + "T12:00:00Z") - t) <= 864e5) || null;
}
/* tonight's starter: nflverse's listed (or projected) QB unless ESPN's report has him out or doubtful, then the club's
   QB with the most dropbacks this season besides him (else last season's), else a replacement-level QB */
function starterFor(ix, g, side, injuries, season, before) {
  const id = side === "home" ? g.hqb : g.aqb, name = side === "home" ? g.hqbn : g.aqbn, club = side === "home" ? g.home : g.away;
  const hurt = (injuries || []).find(i => /QB/.test(i.pos || "") && SEVERE.test(i.status || "") && name && normName(i.name) === normName(name));
  const lastStarter = () => { const past = ix.games.filter(x => x.season === season && x.day < before && x.hs != null && (x.home === club || x.away === club)).sort((a, b) => a.day < b.day ? 1 : -1)[0]; return past ? (past.home === club ? past.hqb : past.aqb) : null; };
  if (id && !hurt) return { id: id, name: name, listed: true };
  if (!id && !hurt) { const ls = lastStarter(); if (ls) return { id: ls, name: (ix.state.qbs[ls] || {}).n || null, listed: false }; }
  /* a backup: this season's other QBs by starts, then last season's mix */
  const cands = {};
  ix.games.filter(x => x.season === season && x.day < before && x.hs != null && (x.home === club || x.away === club)).forEach(x => { const q = x.home === club ? x.hqb : x.aqb; if (q && q !== id) cands[q] = (cands[q] || 0) + 1; });
  let best = Object.entries(cands).sort((a, b) => b[1] - a[1])[0];
  if (!best) best = ((ix.state.mix || {})[club] || []).filter(([q]) => q !== id).sort((a, b) => b[1] - a[1])[0];
  return best ? { id: best[0], name: (ix.state.qbs[best[0]] || {}).n || null, listed: false, replaces: name } : { id: null, name: null, listed: false, replaces: name };
}
/* the expected margin (home minus away) for a game, from games before its day. null when the game or a club is unknown.
   g: { home, away (nflverse codes), commenceMs, homeInjuries, awayInjuries, neutral, restHome, restAway } */
function rate(ix, g) {
  const P = PARAMS, NT = ix.teams.length, TI = ix.TI;
  if (TI[g.home] == null || TI[g.away] == null) return null;
  const row = findGame(ix, g.home, g.away, g.commenceMs);
  const season = row ? row.season : seasonOf(g.commenceMs), day = row ? row.day : etDay(g.commenceMs);
  const pr = priorsFor(ix, season);
  const fin = ix.games.filter(x => x.season === season && x.day < day && x.hs != null);
  const gpOf = t => fin.filter(x => x.home === t || x.away === t).length;
  const pm = ridge(NT, fin.map(x => ({ idx: [[TI[x.home], 1], [TI[x.away], -1]], y: (x.hs - x.as) - (x.neutral ? 0 : P.H), w: 1 })), P.sM * P.sM, Array.from(pr.margin, x => P.cM * x), new Array(NT).fill(P.sM * P.sM / P.kM));
  const s2 = P.sE * P.sE;
  const m0 = Array.from(pr.off, x => P.cO * x).concat(Array.from(pr.def, x => P.cD * x)).concat([pr.mu]);
  const v0 = new Array(NT).fill(s2 / (P.kO * P.plays)).concat(new Array(NT).fill(s2 / (P.kD * P.plays))).concat([1]);
  const pe = ridge(2 * NT + 1, epaObs(ix, fin, true), s2, m0, v0);
  const ih = TI[g.home], ia = TI[g.away];
  const vm = new Float64Array(NT); vm[ih] = 1; vm[ia] = -1;
  const ve = new Float64Array(2 * NT + 1); ve[ih] += 1; ve[NT + ih] -= 1; ve[ia] -= 1; ve[NT + ia] += 1;
  const dr = pm.m[ih] - pm.m[ia], netH = pe.m[ih] - pe.m[NT + ih], netA = pe.m[ia] - pe.m[NT + ia], de = netH - netA;
  /* the quarterbacks */
  const qref = club => {
    let s1 = 0, w1 = 0;
    fin.forEach(x => { if (x.home !== club && x.away !== club) return; const q = x.home === club ? x.hqb : x.aqb; if (!q) return; s1 += qbValue(ix, q, season).q; w1 += 1; });
    let sl = 0, wl = 0; ((ix.state.mix || {})[club] || []).forEach(([q, db]) => { sl += db * qbValue(ix, q, season).q; wl += db; });
    return (s1 + P.kQref * (wl ? sl / wl : P.qbPrior)) / (w1 + P.kQref);
  };
  const stH = row ? starterFor(ix, row, "home", g.homeInjuries, season, day) : { id: null }, stA = row ? starterFor(ix, row, "away", g.awayInjuries, season, day) : { id: null };
  const qH = stH.id ? qbValue(ix, stH.id, season) : { q: P.qbPrior, db: 0 }, qA = stA.id ? qbValue(ix, stA.id, season) : { q: P.qbPrior, db: 0 };
  const refH = qref(g.home), refA = qref(g.away), dq = (qH.q - refH) - (qA.q - refA);
  const neutral = row ? row.neutral : !!g.neutral;
  const restH = row && row.hrest != null ? row.hrest : g.restHome, restA = row && row.arest != null ? row.arest : g.restAway;
  const restGap = Number.isFinite(restH) && Number.isFinite(restA) ? Math.max(-7, Math.min(7, restH - restA)) : 0;
  const part = { home: neutral ? 0 : BETA.home, rating: BETA.rating * dr, epa: BETA.epa * P.plays * de, qb: BETA.qb * P.dropbacks * dq, rest: BETA.rest * restGap };
  const margin = part.home + part.rating + part.epa + part.qb + part.rest;
  const sd = Math.sqrt(BETA.rating * BETA.rating * contrastVar(pm, vm) + Math.pow(BETA.epa * P.plays, 2) * contrastVar(pe, ve));
  return { margin: margin, sd: sd, part: part, row: row, neutral: neutral, restH: restH, restA: restA, gpHome: gpOf(g.home), gpAway: gpOf(g.away),
    ratingHome: pm.m[ih], ratingAway: pm.m[ia], epaHome: netH, epaAway: netA,
    qbHome: { id: stH.id, name: stH.name || qH.name, q: qH.q, ref: refH, replaces: stH.replaces || null }, qbAway: { id: stA.id, name: stA.name || qA.name, q: qA.q, ref: refA, replaces: stA.replaces || null } };
}

/* ---------- the hook: the old margin model's game, re-centred on this one ----------
   gm: scripts/model.js gameModel's game; x: { homeAbbr, awayAbbr (ESPN), commenceMs, homeInjuries, awayInjuries, neutral,
   restHome, restAway, injuries: { home: { cost, out, soft }, away } (listings other than the quarterback, which this
   model prices itself) }. Returns a new game, or gm unchanged when nflverse does not know the game. */
function apply(gm, ix, x) {
  if (!gm || !ix) return gm;
  const home = FROM_ESPN[x.homeAbbr] || x.homeAbbr, away = FROM_ESPN[x.awayAbbr] || x.awayAbbr;
  const r = rate(ix, { home: home, away: away, commenceMs: x.commenceMs, homeInjuries: x.homeInjuries, awayInjuries: x.awayInjuries, neutral: x.neutral, restHome: x.restHome, restAway: x.restAway });
  if (!r || !r.row) return gm;
  const inj = x.injuries || { home: { cost: 0, out: [], soft: [] }, away: { cost: 0, out: [], soft: [] } };
  const margin = r.margin - inj.home.cost + inj.away.cost;
  const fmt = n => (n > 0 ? "+" : "") + r1(n), fmt2 = n => (n > 0 ? "+" : "") + Math.round(n * 100) / 100, H = gm.home, A = gm.away, reasons = [];
  reasons.push({ side: r.ratingHome >= r.ratingAway ? "home" : "away", label: H + " rate " + fmt(r.ratingHome) + " and " + A + " " + fmt(r.ratingAway) + " points a game against their schedules (this season's results, last season carried over); EPA a play " + fmt2(r.epaHome) + " and " + fmt2(r.epaAway) + " net of defence (nflverse)" + (r.neutral ? "; neutral site, no home edge" : "") });
  const qbLine = (q, club, side) => {
    const pts = BETA.qb * PARAMS.dropbacks * (q.q - q.ref);
    if (!q.name || Math.abs(pts) < 0.5) return;
    reasons.push({ side: pts > 0 ? side : side === "home" ? "away" : "home", label: q.name + " starts for " + club + (q.replaces ? " (" + q.replaces + " is listed out)" : "") + ": " + fmt2(q.q) + " EPA a dropback against " + fmt2(q.ref) + " behind their numbers (" + fmt(pts) + " points)" });
  };
  qbLine(r.qbHome, H, "home"); qbLine(r.qbAway, A, "away");
  if (!r.neutral) reasons.push({ side: "home", label: "Home edge " + fmt(BETA.home) + " for " + H });
  if (Math.abs(r.part.rest) >= 0.3) reasons.push({ side: r.part.rest > 0 ? "home" : "away", label: (r.part.rest > 0 ? H : A) + " rested longer (" + r.restH + " days against " + r.restA + ", " + fmt(Math.abs(r.part.rest)) + ")" });
  if (inj.home.out.length) reasons.push({ side: "away", label: H + " without " + inj.home.out.slice(0, 3).join(", ") + (inj.home.out.length > 3 ? " and " + (inj.home.out.length - 3) + " more" : "") + " (" + fmt(-inj.home.cost) + ")" });
  if (inj.away.out.length) reasons.push({ side: "home", label: A + " without " + inj.away.out.slice(0, 3).join(", ") + (inj.away.out.length > 3 ? " and " + (inj.away.out.length - 3) + " more" : "") + " (" + fmt(inj.away.cost) + ")" });
  (gm.reasons || []).filter(q => q.side === "total").forEach(q => reasons.push(q));
  const parts = Object.assign({}, gm.parts, { model: "nflverse", ratingHome: r1(r.ratingHome), ratingAway: r1(r.ratingAway), homeEdge: r.part.home, rest: r1(r.part.rest), injuriesHome: r1(-inj.home.cost) || 0, injuriesAway: r1(inj.away.cost) || 0,
    epaHome: r3(r.epaHome), epaAway: r3(r.epaAway), epaPoints: r1(r.part.epa), qbPoints: r1(r.part.qb), qbHome: r.qbHome.name, qbAway: r.qbAway.name, marginSd: Math.round(r.sd * 100) / 100 });
  return Object.assign({}, gm, { margin: margin, marginSd: r.sd, parts: parts, reasons: reasons, nflverse: true });
}

module.exports = { PARAMS, BETA, FROM_ESPN, ATTRIBUTION, RELEASE, seasonOf, parseCsv, build, load, lazy, isFresh, lastBoundary, index, rate, apply, qbValue, findGame, starterFor, ridge, fixtureFetcher };
