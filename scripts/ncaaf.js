/* ==========================================================================
   EdgeLine AI — college football (NCAAF, FBS), added 2026-11-08
   Owner: "Let's go ahead and work on college football, with the same
   evaluation method." The probability comes from game data only (ESPN's
   final scores), never from other books' prices; prices are for evaluation
   (open, close, CLV) and the held-out replay decides what may become a lean.

   Why college needs its own model: 138 FBS teams play 12 games each, inside
   conferences that meet each other only a few times a season, with talent
   gaps of five touchdowns. A team's raw average margin mostly measures its
   schedule. So every team gets a schedule-adjusted rating from every FBS
   game this season (a ridge fit of the margins: home minus away = rating
   gap + home edge, each rating pulled toward a prior worth `k` games), and
   the prior is part of last season's final rating (`c`). Totals get the same
   treatment with an offence and a defence rating per team. FCS opponents are
   rated as a pooled group (one mean, a strong prior per team), only so the
   FBS teams' results against them count at their true size; a game with an
   FCS team is never modelled (no lean, see forEvent).

   Data: ESPN's public college-football scoreboard, one request a week
   (groups=80: every game with an FBS team, FCS opponents included), this
   season to date and all of last season, read once a run and cached. Free,
   no key. Every number below was fitted on held-out seasons, results only
   (see SPORT and the CLAUDE.md section "College football (2026-11-08)").
   This file is self-contained (no require of model.js or context.js, which
   both load it).
   ========================================================================== */
"use strict";

const KEY = "americanfootball_ncaaf";
/* ESPN's conference ids for the FBS: ACC 1, Big 12 4, Big Ten 5, SEC 8, Pac-12 9, Conference USA 12, MAC 15, Mountain West
   17, FBS Independents 18, Sun Belt 37, American 151. A team in any other conference is FCS (or lower) */
const FBS_CONF = new Set(["1", "4", "5", "8", "9", "12", "15", "17", "18", "37", "151"]);

/* The fitted numbers (2026-11-08, ESPN finals only; fitted on 2022-2023 with 2021 as the first prior, tested on 2024,
   2025 and 2026 to date: see CLAUDE.md, "College football (2026-11-08)").
   home: home edge in points (none at a neutral site); cap: a margin counts up to this many points in the ratings (a
   70-0 win says little more than a 35-0 one); k: games of evidence the prior is worth for a team's margin rating;
   c: the share of last season's final rating a team starts from; kFcs: the same for an FCS team, pulled toward the
   pooled FCS mean; kT / cT: the same for the offence and defence ratings behind the total; sd / sdTotal: the spread
   of the final margin and total around the projection (normal curve), widening by sdSlope / sdTotalSlope per point
   of projected margin / total (0: no gain held out); rest: points for a team coming off a bye (12+ days) against one that is
   not (2 fitted on 2022-2023 by 0.015 points of error, then worse held out, 16.573 against 16.556: set to 0). */
const P = { home: 2.8, cap: 35, k: 3, c: 0.9, kFcs: 2, kT: 6, cT: 0.4, sd: 16, sdSlope: 0, sdTotal: 16, sdTotalSlope: 0, rest: 0, lastK: 0.1, iters: 60 };

/* model.js's per-sport block for NCAAF (see SPORT in model.js). sd and sdTotal are the curve's spread; carry.k and kTotal
   are the prior's weight in games, which model.noise() reads for the side's own bar (the model's error on a rating gap:
   sd x sqrt(1 / (gp + k) for each team)). No injury cost: ESPN's college injury report is thin and uneven across 138
   teams, and it cannot be replayed (no history), so it is shown as context only. */
const SPORT = { homeEdge: P.home, sd: P.sd, sdTotal: P.sdTotal, k: P.k, form: 0, carry: { k: P.k, c: P.c }, kTotal: P.kT, leagueGoals: 28, b2b: 0, rest3: 0, out: () => 0, soft: 0.5, scoringOut: () => 0 };

/* Calibration per market (model.js CALIB: p' = 1 / (1 + e^-(a + b logit p)) on the home or over side; a slope under 0.5
   is no signal at the books' lines, so model.hasSignal keeps the market off the board). Fitted on 2022-2023 at the closing
   line, results only (the line says where our probability is read; no price takes part), scored on 2024-2026:
   - spreads: b -0.18 ± 0.07 on the fit seasons (floored at 0); held out our probability at the books' line scored 0.7495
     log-loss against a coin flip's 0.6931 (slope -0.03 ± 0.06). Reads even.
   - totals: b 0.11 ± 0.12; held out 0.7313 against 0.6931 (slope -0.02 ± 0.07). Reads about even.
   - moneyline: a 0.02, b 0.98 ± 0.06, held out 0.5621 raw against 0.5620 mapped: left as it is (calibrated against
     results, slope 1.03 ± 0.06 on the test seasons), but held (HOLD below).
   The intercepts were within one error of 0 and are set to 0. */
const CALIB = { spreads: [0, 0], totals: [0, 0.11] };
/* Held: the moneyline (see HOLD in model.js). Held out on 2024-2026 (2,033 games with a closing moneyline) the model scored
   0.5777 log-loss against the market's 0.5423, and with both in one regression the model's weight was 0.00 ± 0.10 at the
   close and 0.07 ± 0.11 at the open: no information the price lacks. The sides the one-a-game rule would post (151, 89%
   underdogs) won 31.1% where the closing price implied 30.7% and we said 56.7%; ROI +3.7% ± 19.8% at the close, +4.6% ±
   25.7% at the open (139): long shots' noise around the price's own rate. Its probabilities are still shown; no side is posted until a replay backs it. */
const HOLD = { h2h: "Past seasons: our college moneylines won about as often as the price said, not as often as we said, so no side here is posted" };

/* The odds feed's names that differ from ESPN's (The Odds API and the books spell some schools out). Keyed by ESPN team id;
   update-teams.js writes them into data/teams.js as `aka` (js/teams.js matches them), and context.js matches them
   through CLUB_ALIAS. ESPN's own names already match the feed for most schools, including "Miami Hurricanes" and
   "Miami (OH) RedHawks" (two schools: "Miami" alone resolves to neither) and "USC Trojans" (South Carolina is "SC"). */
const AKA = {
  "2026": ["Appalachian State Mountaineers", "Appalachian State"],
  "41": ["Connecticut Huskies", "Connecticut"],
  "152": ["North Carolina State Wolfpack", "North Carolina State"],
  "145": ["Mississippi Rebels"],
  "30": ["Southern California Trojans", "Southern California", "Southern Cal Trojans"],
  "2116": ["Central Florida Knights", "Central Florida"],
  "2390": ["Miami (FL) Hurricanes", "Miami FL Hurricanes", "Miami (FL)", "Miami Florida"],
  "193": ["Miami (Ohio) RedHawks", "Miami Ohio RedHawks", "Miami Ohio"],
  "62": ["Hawaii Rainbow Warriors", "Hawaii"],
  "2534": ["Sam Houston State Bearkats", "Sam Houston State"],
  "309": ["Louisiana Lafayette Ragin Cajuns", "UL Lafayette Ragin Cajuns", "Louisiana-Lafayette"],
  "2433": ["Louisiana-Monroe Warhawks", "Louisiana Monroe Warhawks", "ULM Warhawks"],
  "2229": ["FIU Panthers", "Florida Intl Panthers"],
  "113": ["UMass Minutemen", "UMass"],
  "2572": ["Southern Mississippi Golden Eagles", "Southern Mississippi"],
  "2393": ["Middle Tennessee State Blue Raiders", "MTSU Blue Raiders"],
  "2567": ["Southern Methodist Mustangs"],
  "2628": ["Texas Christian Horned Frogs"],
  "252": ["Brigham Young Cougars"],
  "99": ["Louisiana State Tigers"],
  "2636": ["UT San Antonio Roadrunners", "Texas-San Antonio Roadrunners"],
  "2638": ["UT El Paso Miners", "Texas-El Paso Miners"],
  "2439": ["Nevada-Las Vegas Rebels"],
  "55": ["Jax State Gamecocks"],
  "23": ["San Jose State Spartans"]
};
/* the same normalisation as context.js clubCore, so the aliases meet ESPN's names there */
function core(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").split(" ").filter(w => w && !/^(fc|sc|cf|afc)$/.test(w)).join(""); }

/* ---------- time ---------- */
const ET = "America/New_York";
function etDay(ms) { return new Intl.DateTimeFormat("en-CA", { timeZone: ET, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms)); }
/* the season a game belongs to, as ESPN numbers it: the year of the autumn (a bowl on January 1 2027 is the 2026 season) */
function seasonOf(ms) { const d = new Date(ms); return d.getUTCMonth() + 1 >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1; }

/* ---------- games from ESPN's scoreboard ---------- */
/* every completed game in a scoreboard response, as { id, date, st, home, away, hs, as, neutral, hc, ac } (team ids, scores,
   neutral site, conference ids) */
function gamesFrom(sb) {
  const out = [];
  for (const e of (sb && sb.events) || []) {
    const c = e.competitions && e.competitions[0]; if (!c || !c.competitors) continue;
    const done = c.status && c.status.type && c.status.type.completed;
    const h = c.competitors.find(x => x.homeAway === "home"), a = c.competitors.find(x => x.homeAway === "away");
    if (!h || !a || !h.team || !a.team) continue;
    const hs = Number(h.score && h.score.value != null ? h.score.value : h.score), as = Number(a.score && a.score.value != null ? a.score.value : a.score);
    out.push({ id: String(e.id), date: Date.parse(e.date), st: Number((e.season && e.season.type) || 2), done: !!done && Number.isFinite(hs) && Number.isFinite(as),
      home: String(h.team.id), away: String(a.team.id), hs: hs, as: as, neutral: !!c.neutralSite, hc: h.team.conferenceId != null ? String(h.team.conferenceId) : null, ac: a.team.conferenceId != null ? String(a.team.conferenceId) : null,
      hn: h.team.displayName || h.team.location, an: a.team.displayName || a.team.location });
  }
  return out;
}
function isFbsConf(cid) { return cid != null && FBS_CONF.has(String(cid)); }
/* the FBS teams in a list of games (by their conference) */
function fbsOf(games) { const s = new Set(); games.forEach(g => { if (isFbsConf(g.hc)) s.add(g.home); if (isFbsConf(g.ac)) s.add(g.away); }); return s; }

/* ---------- the ratings ----------
   Margin: home margin = r[home] - r[away] + home edge (none at a neutral site) + noise, each margin capped at P.cap.
   Totals: home points = mu + o[home] - d[away], away points = mu + o[away] - d[home].
   Each rating is pulled toward its prior mean by k games of evidence (ridge): an FBS team's prior mean is c x last
   season's final rating (0 without one), an FCS team's the pooled FCS mean (fitted, unpenalised). Solved by
   Gauss-Seidel; `warm` (a previous fit) starts it close. Returns { r, o, d, mu, gp, fcsR, fcsO, fcsD }. */
function fit(games, fbs, prior, opts, warm) {
  const o = Object.assign({}, P, opts || {});
  const done = games.filter(g => g.done);
  const teams = []; const seen = {}, idx = {};
  done.forEach(g => { [g.home, g.away].forEach(t => { if (!seen[t]) { seen[t] = 1; idx[t] = teams.length; teams.push(t); } }); });
  const n = teams.length, fb = teams.map(t => fbs.has(t));
  const games2 = done.map(g => { const m = g.hs - g.as; return { h: idx[g.home], a: idx[g.away], m: Math.max(-o.cap, Math.min(o.cap, m)), ph: g.hs, pa: g.as, hh: g.neutral ? 0 : o.home }; });
  const adj = teams.map(() => []); games2.forEach((g, i) => { adj[g.h].push(i); adj[g.a].push(i); });
  const last = t => prior && prior.r && prior.r[t] != null ? prior.r[t] : null;
  const lastO = t => prior && prior.o && prior.o[t] != null ? prior.o[t] : null, lastD = t => prior && prior.d && prior.d[t] != null ? prior.d[t] : null;
  const r = teams.map(t => warm && warm.r[t] != null ? warm.r[t] : (last(t) != null ? o.c * last(t) : 0));
  const of = teams.map(t => warm && warm.o[t] != null ? warm.o[t] : 0), df = teams.map(t => warm && warm.d[t] != null ? warm.d[t] : 0);
  let F = warm && warm.fcsR != null ? warm.fcsR : (prior && prior.fcsR != null ? prior.fcsR : -20), Fo = warm && warm.fcsO != null ? warm.fcsO : -8, Fd = warm && warm.fcsD != null ? warm.fcsD : -8;
  let mu = warm && warm.mu != null ? warm.mu : 28;
  const k = i => fb[i] ? o.k : o.kFcs, kT = i => fb[i] ? o.kT : o.kFcs;
  const pm = i => fb[i] ? (last(teams[i]) != null ? o.c * last(teams[i]) : (prior ? (o.newFbs != null ? o.newFbs : F) : 0)) : F;
  const pmO = i => fb[i] ? (lastO(teams[i]) != null ? o.cT * lastO(teams[i]) : (prior ? Fo : 0)) : Fo;
  const pmD = i => fb[i] ? (lastD(teams[i]) != null ? o.cT * lastD(teams[i]) : (prior ? Fd : 0)) : Fd;
  for (let it = 0; it < o.iters; it++) {
    let moved = 0;
    for (let i = 0; i < n; i++) {
      let s = k(i) * pm(i), w = k(i), so = kT(i) * pmO(i), sd = kT(i) * pmD(i), wt = kT(i);
      for (const gi of adj[i]) {
        const g = games2[gi];
        if (g.h === i) { s += g.m - g.hh + r[g.a]; so += g.ph - mu + df[g.a]; sd += mu + of[g.a] - g.pa; }
        else { s += r[g.h] + g.hh - g.m; so += g.pa - mu + df[g.h]; sd += mu + of[g.h] - g.ph; }
        w++; wt++;
      }
      const nr = s / w; moved = Math.max(moved, Math.abs(nr - r[i])); r[i] = nr; of[i] = so / wt; df[i] = sd / wt;
    }
    /* the pooled FCS means (unpenalised) and the league's points per team-game */
    const fi = [], sum = (a) => a.reduce((x, y) => x + y, 0);
    for (let i = 0; i < n; i++) if (!fb[i]) fi.push(i);
    if (fi.length) { F = sum(fi.map(i => r[i])) / fi.length; Fo = sum(fi.map(i => of[i])) / fi.length; Fd = sum(fi.map(i => df[i])) / fi.length; }
    let pts = 0, cnt = 0; games2.forEach(g => { pts += g.ph - of[g.h] + df[g.a] + g.pa - of[g.a] + df[g.h]; cnt += 2; });
    if (cnt) mu = pts / cnt;
    if (moved < 1e-4 && it > 2) break;
  }
  const out = { r: {}, o: {}, d: {}, mu: mu, gp: {}, fcsR: F, fcsO: Fo, fcsD: Fd };
  teams.forEach((t, i) => { out.r[t] = r[i]; out.o[t] = of[i]; out.d[t] = df[i]; out.gp[t] = adj[i].length; });
  return out;
}
/* last season's final ratings, centred on the FBS mean (the prior for this season) */
function finalRatings(games, opts) {
  const fbs = fbsOf(games);
  const R = fit(games, fbs, null, Object.assign({}, opts || {}, { k: (opts && opts.lastK) || P.lastK, kT: (opts && opts.lastK) || P.lastK, kFcs: (opts && opts.kFcs) || P.kFcs }));
  const ids = Object.keys(R.r).filter(t => fbs.has(t));
  const mean = (m) => ids.reduce((s, t) => s + m[t], 0) / Math.max(1, ids.length);
  const cr = mean(R.r), co = mean(R.o), cd = mean(R.d);
  const out = { r: {}, o: {}, d: {}, mu: R.mu, fcsR: R.fcsR - cr, gp: R.gp };
  Object.keys(R.r).forEach(t => { out.r[t] = R.r[t] - cr; out.o[t] = R.o[t] - co; out.d[t] = R.d[t] - cd; });
  return out;
}
/* days since a team's last game before `ms`, from the season's games (any opponent) */
function restDays(games, team, ms) {
  let lastT = null;
  games.forEach(g => { if (g.done && (g.home === team || g.away === team) && g.date < ms - 36e5 && (lastT == null || g.date > lastT)) lastT = g.date; });
  if (lastT == null) return null;
  const day = x => Date.parse(etDay(x) + "T12:00:00Z");
  return Math.round((day(ms) - day(lastT)) / 864e5);
}
/* the projection for one game from a fit: margin (home minus away), total, and the parts behind them */
function project(R, home, away, neutral, rest, opts) {
  const o = Object.assign({}, P, opts || {});
  const rh = R.r[home] != null ? R.r[home] : R.fcsR, ra = R.r[away] != null ? R.r[away] : R.fcsR;
  const oh = R.o[home] != null ? R.o[home] : R.fcsO, oa = R.o[away] != null ? R.o[away] : R.fcsO;
  const dh = R.d[home] != null ? R.d[home] : R.fcsD, da = R.d[away] != null ? R.d[away] : R.fcsD;
  const bye = x => x != null && x >= 12;
  const restAdj = rest ? o.rest * ((bye(rest.home) ? 1 : 0) - (bye(rest.away) ? 1 : 0)) : 0;
  const hh = neutral ? 0 : o.home;
  const margin = rh - ra + hh + restAdj, total = 2 * R.mu + oh + oa - dh - da;
  return { margin: margin, total: total, rh: rh, ra: ra, hh: hh, restAdj: restAdj, sd: o.sd + o.sdSlope * Math.abs(margin), sdTotal: o.sdTotal + o.sdTotalSlope * Math.max(0, total - 2 * R.mu), gpH: R.gp[home] || 0, gpA: R.gp[away] || 0 };
}

/* ---------- the season's games from ESPN (one request a week, cached per run) ---------- */
/* the weeks of a season from a scoreboard's calendar: [{ type, week, start }], regular season (2) and postseason (3; the
   playoff's own entry, 999, repeats the bowls) */
function calendarOf(sb) {
  const cal = sb && sb.leagues && sb.leagues[0] && sb.leagues[0].calendar;
  if (!Array.isArray(cal) || !cal.length) return null;
  const out = [];
  cal.forEach(t => { if (String(t.value) === "2" || String(t.value) === "3") (t.entries || []).forEach(w => { if (String(w.value) !== "999") out.push({ type: Number(t.value), week: Number(w.value), start: Date.parse(w.startDate) }); }); });
  return out.length ? out : null;
}
/* without a calendar: weeks 1 to 16 and the bowls */
function defaultWeeks() { const w = []; for (let i = 1; i <= 16; i++) w.push({ type: 2, week: i, start: null }); w.push({ type: 3, week: 1, start: null }); return w; }
/* every game of a season up to `untilMs` (weeks starting later are not asked for), from src.week (context.js) */
async function seasonGames(src, season, sb, C, untilMs) {
  const key = String(season);
  if (C.seasons[key]) return C.seasons[key];
  if (!src || typeof src.week !== "function") return (C.seasons[key] = []);
  let cal = calendarOf(sb), first = null;
  if (!cal) { try { first = await src.week(KEY, season, 2, 1); } catch (err) { first = null; } cal = calendarOf(first); }
  const games = {};
  for (const w of cal || defaultWeeks()) {
    if (untilMs && Number.isFinite(w.start) && w.start > untilMs) continue;
    let j = null;
    if (first && w.type === 2 && w.week === 1) j = first;
    else { try { j = await src.week(KEY, season, w.type, w.week); } catch (err) { j = null; } }
    gamesFrom(j).forEach(g => { games[g.id] = g; });
  }
  return (C.seasons[key] = Object.values(games).sort((a, b) => a.date - b.date));
}

/* ---------- one game's model, in the shape model.js gameModel returns ---------- */
function r1(n) { return Math.round(n * 10) / 10; }
function fmt(n) { return (n > 0 ? "+" : "") + r1(n); }
function record(games, team, beforeMs) {
  let w = 0, l = 0;
  games.forEach(g => { if (!g.done || g.date >= beforeMs || (g.home !== team && g.away !== team)) return; const m = g.home === team ? g.hs - g.as : g.as - g.hs; if (m > 0) w++; else if (m < 0) l++; });
  return w + "-" + l;
}
/* A game with an FCS team is not modelled (null: no probability, never a lean; the market board lists it as unmodelled).
   Why: FCS teams meet FBS teams once or twice a season, so their ratings are a pooled guess; the lines run 30 to 50
   points with moneylines past -5000, and ESPN keeps prices for too few of these games to replay them. */
async function forEvent(src, ctxlib, e, now, cache) {
  cache.scoreboards = cache.scoreboards || {};
  const commenceMs = Date.parse(e.commence); if (!Number.isFinite(commenceMs)) return null;
  const day = etDay(commenceMs).replace(/-/g, ""), sbKey = e.sportKey + "|" + day;
  if (!(sbKey in cache.scoreboards)) cache.scoreboards[sbKey] = await src.scoreboard(e.sportKey, day);
  const sb = cache.scoreboards[sbKey];
  const m = ctxlib.findEvent(sb, e.home, e.away); if (!m) return null;
  if (!isFbsConf(m.home.team.conferenceId) || !isFbsConf(m.away.team.conferenceId)) return null;
  const hId = String(m.home.team.id), aId = String(m.away.team.id), neutral = !!(m.comp && m.comp.neutralSite);
  const season = seasonOf(commenceMs), nowMs = now ? now.getTime() : Date.now(), cutoff = Math.min(nowMs, commenceMs);
  const C = cache.ncaaf = cache.ncaaf || { seasons: {}, prior: {}, fits: {} };
  const thisG = await seasonGames(src, season, sb, C, cutoff + 36e5 * 36);
  if (!(season in C.prior)) { const lastG = await seasonGames(src, season - 1, null, C, null); C.prior[season] = lastG.filter(g => g.done).length >= 200 ? finalRatings(lastG) : null; }
  const prior = C.prior[season];
  const before = thisG.filter(g => g.done && g.date < cutoff);
  const fbs = fbsOf(thisG); fbs.add(hId); fbs.add(aId);
  const fitKey = season + "|" + etDay(cutoff);
  if (!C.fits[fitKey]) C.fits[fitKey] = before.length ? fit(before, fbs, prior, P, null) : null;
  const R = C.fits[fitKey]; if (!R) return null;
  const gpH = R.gp[hId] || 0, gpA = R.gp[aId] || 0;
  if ((!gpH || !gpA) && !(prior && prior.r[hId] != null && prior.r[aId] != null)) return null;
  const rest = { home: restDays(thisG, hId, commenceMs), away: restDays(thisG, aId, commenceMs) };
  const pj = project(R, hId, aId, neutral, rest, P);
  const lastH = prior && prior.r[hId] != null ? prior.r[hId] : null, lastA = prior && prior.r[aId] != null ? prior.r[aId] : null;
  const reasons = [];
  const lastTxt = lastH != null || lastA != null ? "; last season " + (lastH != null ? fmt(lastH) : "none") + " and " + (lastA != null ? fmt(lastA) : "none") : "";
  reasons.push({ side: pj.rh >= pj.ra ? "home" : "away", label: e.home + " rate " + fmt(pj.rh) + " a game against their schedule over " + gpH + " (" + record(thisG, hId, cutoff) + "), " + e.away + " " + fmt(pj.ra) + " over " + gpA + " (" + record(thisG, aId, cutoff) + ")" + lastTxt });
  if (pj.hh) reasons.push({ side: "home", label: "Home edge " + fmt(pj.hh) + " for " + e.home });
  if (pj.restAdj > 0) reasons.push({ side: "home", label: e.home + " come off a bye (" + rest.home + " days)" });
  if (pj.restAdj < 0) reasons.push({ side: "away", label: e.away + " come off a bye (" + rest.away + " days)" });
  reasons.push({ side: "total", label: "Scoring against their schedules: " + e.home + " " + r1(R.mu + R.o[hId] - (R.d[aId] != null ? R.d[aId] : R.fcsD)) + ", " + e.away + " " + r1(R.mu + (R.o[aId] != null ? R.o[aId] : R.fcsO) - R.d[hId]) + " (FBS average " + r1(R.mu) + " a team)" });
  return { sportKey: KEY, home: e.home, away: e.away, margin: pj.margin, total: pj.total, sd: pj.sd, sdTotal: pj.sdTotal, gp: Math.min(gpH, gpA), gpHome: gpH, gpAway: gpA,
    parts: { ratingHome: r1(pj.rh), ratingAway: r1(pj.ra), lastHome: lastH != null ? r1(lastH) : null, lastAway: lastA != null ? r1(lastA) : null, homeEdge: pj.hh, neutral: neutral, rest: r1(pj.restAdj), injuriesHome: 0, injuriesAway: 0, scoringOut: 0, pace: r1(pj.total / 2) },
    reasons: reasons, thin: Math.min(gpH, gpA) < 4, espnEventId: m.event.id, injuries: { home: [], away: [] } };
}
/* the odds feed's spellings as context.js CLUB_ALIAS entries: core(alias) -> core(ESPN's name) */
const ESPN_NAME = { "2026": "App State Mountaineers", "41": "UConn Huskies", "152": "NC State Wolfpack", "145": "Ole Miss Rebels", "30": "USC Trojans", "2116": "UCF Knights", "2390": "Miami Hurricanes", "193": "Miami (OH) RedHawks", "62": "Hawai'i Rainbow Warriors", "2534": "Sam Houston Bearkats", "309": "Louisiana Ragin' Cajuns", "2433": "UL Monroe Warhawks", "2229": "Florida International Panthers", "113": "Massachusetts Minutemen", "2572": "Southern Miss Golden Eagles", "2393": "Middle Tennessee Blue Raiders", "2567": "SMU Mustangs", "2628": "TCU Horned Frogs", "252": "BYU Cougars", "99": "LSU Tigers", "2636": "UTSA Roadrunners", "2638": "UTEP Miners", "2439": "UNLV Rebels", "55": "Jacksonville State Gamecocks", "23": "San José State Spartans" };
function clubAlias() {
  const out = {};
  Object.keys(AKA).forEach(id => { const to = core(ESPN_NAME[id]); if (!to) return; AKA[id].forEach(a => { const k = core(a); if (k && k !== to) out[k] = to; }); });
  return out;
}

module.exports = { KEY, FBS_CONF, P, SPORT, CALIB, HOLD, AKA, ESPN_NAME, clubAlias, core, seasonOf, etDay, gamesFrom, isFbsConf, fbsOf, fit, finalRatings, restDays, project, calendarOf, seasonGames, forEvent };
