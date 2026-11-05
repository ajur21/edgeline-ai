/* ==========================================================================
   EdgeLine AI — the game model (owner rule, 2026-11-04: plays are graded on
   game data, never against other books' prices)
   For every game it prices, the pipeline builds a model from ESPN's public
   data: each team's completed results this season (points for and against,
   margins, recent form), rest, and the injury report, plus a per-sport home
   edge. From that comes an expected margin and total with a per-sport spread
   of outcomes, and from those a probability for every main-line side:
   moneyline, spread (push-aware), total, and the draw for soccer. A side is a
   pick when that probability beats what the best price implies by the bar.
   The sharp line from the odds feed is kept only as "where the market sits"
   and for closing-line value; it takes no part in the grade.
   ========================================================================== */
"use strict";

/* The NHL's own final scores (ESPN, 2024-25 and 2025-26 regular seasons, 2,624 games): how often a game ends by each
   margin (either way; no ties, overtime and the shootout give the winner one goal) and with each total. A two-goal lead
   often becomes three with the goalie pulled, and overtime adds one goal to a tie, so 3 is as common as 2 and totals
   of 5 and 7 are twice as common as 6: shapes a normal curve cannot draw. A game's probabilities come from these
   tables moved to its projected margin and total (see shapeProb). */
const NHL_SHAPE = {
  margin: [[1, 0.40739], [2, 0.19703], [3, 0.22866], [4, 0.11128], [5, 0.03849], [6, 0.00991], [7, 0.00534], [8, 0.00191]],
  total: [[1, 0.01372], [2, 0.01524], [3, 0.10633], [4, 0.08346], [5, 0.22599], [6, 0.10938], [7, 0.19779], [8, 0.07508], [9, 0.10061], [10, 0.02782], [11, 0.02934], [12, 0.00838], [13, 0.00534], [14, 0.00038], [15, 0.00114]]
};
/* per-sport numbers: home edge and adjustments in the sport's points; sd = spread of the final margin and total.
   k: games of evidence before a team's margin counts half (shrinkage toward even); form: the weight on the last five.
   NHL (calibrated 2026-11-04 on final scores only, never prices; fitted on one full season and tested on the other):
   k 35 and form 0.1 (a 16-game goal differential is mostly noise; k 8 / form 0.4 predicted worse than no rating at all),
   home edge 0.24, kTotal 80 (each team's scoring pulled toward the league's goals per game this season, from the ESPN
   standings, leagueGoals as the fallback), and shape for the probabilities. */
const SPORT = {
  basketball_nba:        { homeEdge: 2.5, sd: 12.5, sdTotal: 19, k: 6,  b2b: -1.5, rest3: 0.5,  out: (i, ppg) => ppg != null ? 0.12 * ppg : 1.2, soft: 0.5, scoringOut: ppg => ppg != null ? 0.15 * ppg : 1.5 },
  americanfootball_nfl:  { homeEdge: 2.0, sd: 13.5, sdTotal: 14, k: 3,  b2b: 0,    rest3: 0,    out: i => /QB/.test(i.pos || "") ? 4 : 0.5, soft: 0.5, scoringOut: () => 1, single: /QB/ },
  icehockey_nhl:         { homeEdge: 0.24, sd: 2.4, sdTotal: 2.3, k: 35, form: 0.1, kTotal: 80, leagueGoals: 3.1, shape: NHL_SHAPE, b2b: -0.25, rest3: 0.05, out: i => (i.pos || "") === "G" ? 0.5 : 0.12, soft: 0.5, scoringOut: () => 0.1, single: /^G$/ },
  baseball_mlb:          { homeEdge: 0.2, sd: 4.2,  sdTotal: 4.6, k: 10, b2b: 0,   rest3: 0,    out: i => /^(SP|P|RP)$/.test(i.pos || "") ? 0.3 : 0.12, soft: 0.5, scoringOut: () => 0.15 },
  soccer_epl:            { homeEdge: 0.3, sd: 1.7,  sdTotal: 1.8, k: 4,  b2b: 0,   rest3: 0.05, out: () => 0.15, soft: 0.5, scoringOut: () => 0.1, threeWay: true, drawBand: 0.5 }
};
const SEVERE = /^(out|injured reserve|ir|doubtful|suspended|season)/i, SOFT = /^(questionable|day-to-day|day to day|probable|game time)/i;

function erf(x) { const s = x < 0 ? -1 : 1; x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return s * y; }
function Phi(z) { return 0.5 * (1 + erf(z / Math.SQRT2)); }
function implied(a) { const o = Number(a); return o < 0 ? -o / (-o + 100) : 100 / (o + 100); }
function r1(n) { return Math.round(n * 10) / 10; }
function r4(n) { return Math.round(n * 1e4) / 1e4; }
function avg(a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0; }

/* ---------- a team's season so far, from its ESPN schedule ---------- */
function teamForm(sched, teamId, beforeMs) {
  const games = [];
  for (const e of (sched && sched.events) || []) {
    const c = e.competitions && e.competitions[0]; if (!c || !c.competitors) continue;
    if (!(c.status && c.status.type && c.status.type.completed)) continue;
    const st = (e.seasonType && e.seasonType.type) || (e.season && e.season.type); if (st != null && Number(st) !== 2) continue; /* regular season only */
    const t = Date.parse(e.date); if (beforeMs && Number.isFinite(t) && t >= beforeMs) continue;
    const me = c.competitors.find(x => x.team && String(x.team.id) === String(teamId)), op = c.competitors.find(x => x.team && String(x.team.id) !== String(teamId));
    if (!me || !op) continue;
    const pf = Number(me.score && (me.score.value != null ? me.score.value : me.score.displayValue)), pa = Number(op.score && (op.score.value != null ? op.score.value : op.score.displayValue));
    if (!Number.isFinite(pf) || !Number.isFinite(pa)) continue;
    games.push({ date: t, pf: pf, pa: pa, margin: pf - pa, home: me.homeAway === "home", opp: op.team && (op.team.abbreviation || op.team.displayName) });
  }
  games.sort((a, b) => b.date - a.date); /* newest first */
  const m = games.map(g => g.margin);
  return { gp: games.length, pf: avg(games.map(g => g.pf)), pa: avg(games.map(g => g.pa)), margin: avg(m), last5: avg(m.slice(0, 5)), wins: games.filter(g => g.margin > 0).length, losses: games.filter(g => g.margin < 0).length, games: games };
}
/* the rating: season margin leaning on recent form, pulled toward average when the sample is short */
function rating(form, cfg) { if (!form || !form.gp) return 0; const w = cfg.form != null ? cfg.form : 0.4; const raw = (1 - w) * form.margin + w * form.last5; return raw * (form.gp / (form.gp + cfg.k)); }

/* ---------- injuries in the sport's points ---------- */
/* cfg.single: a position only one player fills at a time (an NHL goalie, an NFL quarterback). A team loses its starter
   once however many of them are listed, so only the costliest listing at that position counts.
   weightOf(i): the share of the team's results that still had the player (see unseenShare). A player out since before
   the season is already in every result, so he costs nothing more; one listed yesterday costs in full. Only players
   who still move the number (a share of a fifth or more) are named in the reasons. */
function injuryCost(list, cfg, ppgOf, weightOf) {
  let cost = 0, scoring = 0, oneCost = 0, oneScoring = 0; const out = [], soft = [];
  (list || []).forEach(function (i) {
    const ppg = ppgOf ? ppgOf(i) : null, one = !!(cfg.single && cfg.single.test(i.pos || ""));
    const w = weightOf ? Math.max(0, Math.min(1, weightOf(i))) : 1, label = i.name + (i.pos ? " (" + i.pos + ")" : "");
    let c, s;
    if (SEVERE.test(i.status || "")) { c = cfg.out(i, ppg) * w; s = cfg.scoringOut(ppg) * w; if (w >= 0.2) out.push(label); }
    else if (SOFT.test(i.status || "")) { c = cfg.soft * cfg.out(i, ppg) * w; s = 0.5 * cfg.scoringOut(ppg) * w; if (w >= 0.2) soft.push(label); }
    else return;
    if (one) { oneCost = Math.max(oneCost, c); oneScoring = Math.max(oneScoring, s); } else { cost += c; scoring += s; }
  });
  return { cost: cost + oneCost, scoring: scoring + oneScoring, out: out, soft: soft };
}
/* how much of a team's season so far was played with a now-listed player: the games before the listing date over all
   games. The results after it already show the absence. No date (or no games) counts the absence in full. */
function unseenShare(form) {
  return function (i) {
    const t = Date.parse((i && i.date) || "");
    if (!Number.isFinite(t) || !form || !form.gp || !form.games) return 1;
    return form.games.filter(g => g.date < t).length / form.gp;
  };
}

/* ---------- the game: expected margin (home minus away) and total ---------- */
function gameModel(input) {
  const cfg = SPORT[input.sportKey]; if (!cfg) return null;
  const hf = input.homeForm, af = input.awayForm;
  if (!hf || !af || !hf.gp || !af.gp) return null;
  const rh = rating(hf, cfg), ra = rating(af, cfg);
  const rest = t => input.rest && input.rest[t];
  let restAdj = 0; const restNotes = [];
  if (rest("home") && rest("home").b2b) { restAdj += cfg.b2b; if (cfg.b2b) restNotes.push({ side: "away", label: input.home + " are on the second night of a back-to-back" }); }
  else if (rest("home") && rest("home").restDays >= 3 && cfg.rest3) { restAdj += cfg.rest3; restNotes.push({ side: "home", label: input.home + " are rested (" + rest("home").restDays + " days)" }); }
  if (rest("away") && rest("away").b2b) { restAdj -= cfg.b2b; if (cfg.b2b) restNotes.push({ side: "home", label: input.away + " are on the second night of a back-to-back" }); }
  else if (rest("away") && rest("away").restDays >= 3 && cfg.rest3) { restAdj -= cfg.rest3; restNotes.push({ side: "away", label: input.away + " are rested (" + rest("away").restDays + " days)" }); }
  const ih = injuryCost(input.homeInjuries, cfg, input.ppgOf, unseenShare(hf)), ia = injuryCost(input.awayInjuries, cfg, input.ppgOf, unseenShare(af));
  const margin = rh - ra + cfg.homeEdge + restAdj - ih.cost + ia.cost;
  /* with kTotal, each scoring average leans toward the league's goals per team-game until the sample is long */
  const L = cfg.kTotal ? (Number.isFinite(input.leagueGoals) && input.leagueGoals > 0 ? input.leagueGoals : cfg.leagueGoals) : null;
  const sh = (x, gp) => L == null ? x : (gp * x + cfg.kTotal * L) / (gp + cfg.kTotal);
  const total = (sh(hf.pf, hf.gp) + sh(af.pa, af.gp) + sh(af.pf, af.gp) + sh(hf.pa, hf.gp)) / 2 - (ih.scoring + ia.scoring);
  const reasons = [];
  const fmt = n => (n > 0 ? "+" : "") + r1(n);
  reasons.push({ side: rh >= ra ? "home" : "away", label: input.home + " rate " + fmt(rh) + " a game over " + hf.gp + " (" + hf.wins + "-" + hf.losses + "), " + input.away + " " + fmt(ra) + " over " + af.gp + " (" + af.wins + "-" + af.losses + ")" });
  if (Math.abs(hf.last5 - hf.margin) >= cfg.sd / 4 && hf.gp >= 5) reasons.push({ side: hf.last5 > hf.margin ? "home" : "away", label: input.home + " trending: last five " + fmt(hf.last5) + " vs " + fmt(hf.margin) + " on the season" });
  if (Math.abs(af.last5 - af.margin) >= cfg.sd / 4 && af.gp >= 5) reasons.push({ side: af.last5 > af.margin ? "away" : "home", label: input.away + " trending: last five " + fmt(af.last5) + " vs " + fmt(af.margin) + " on the season" });
  reasons.push({ side: "home", label: "Home edge " + fmt(cfg.homeEdge) + " for " + input.home });
  restNotes.forEach(n => reasons.push(n));
  if (ih.out.length) reasons.push({ side: "away", label: input.home + " without " + ih.out.slice(0, 3).join(", ") + (ih.out.length > 3 ? " and " + (ih.out.length - 3) + " more" : "") + " (" + fmt(-ih.cost) + ")" });
  if (ih.soft.length) reasons.push({ side: "away", label: input.home + " have " + ih.soft.slice(0, 3).join(", ") + " listed day-to-day or questionable" });
  if (ia.out.length) reasons.push({ side: "home", label: input.away + " without " + ia.out.slice(0, 3).join(", ") + (ia.out.length > 3 ? " and " + (ia.out.length - 3) + " more" : "") + " (" + fmt(ia.cost) + ")" });
  if (ia.soft.length) reasons.push({ side: "home", label: input.away + " have " + ia.soft.slice(0, 3).join(", ") + " listed day-to-day or questionable" });
  const pace = hf.pf + hf.pa + af.pf + af.pa;
  reasons.push({ side: "total", label: "Combined scoring " + r1(hf.pf + hf.pa) + " a game in " + input.home + "'s games, " + r1(af.pf + af.pa) + " in " + input.away + "'s" + (L != null ? " (league average " + r1(2 * L) + ")" : "") + (ih.scoring + ia.scoring >= cfg.sdTotal / 10 ? "; scorers out take " + r1(ih.scoring + ia.scoring) + " off" : "") });
  return { sportKey: input.sportKey, home: input.home, away: input.away, margin: r1(margin), total: r1(total), sd: cfg.sd, sdTotal: cfg.sdTotal, gp: Math.min(hf.gp, af.gp),
    parts: { ratingHome: r1(rh), ratingAway: r1(ra), homeEdge: cfg.homeEdge, rest: r1(restAdj), injuriesHome: r1(-ih.cost), injuriesAway: r1(ia.cost), scoringOut: r1(ih.scoring + ia.scoring), pace: r1(pace / 2) },
    reasons: reasons, thin: Math.min(hf.gp, af.gp) < 4 };
}

/* ---------- a side's probability ---------- */
/* a line that can push: the win and loss bands either side of the number, renormalised */
function pushAware(z, loseZ) { const w = 1 - Phi(z), l = Phi(loseZ); return w + l > 0 ? w / (w + l) : 0.5; }
/* a discrete distribution ([[value, p], ...]) moved to a target mean by exponential tilting: the league's shape, this game's centre */
function tilt(base, target) {
  if (!Number.isFinite(target)) return base;
  const meanAt = th => { let z = 0, s = 0; for (const [v, p] of base) { const w = p * Math.exp(th * v); z += w; s += w * v; } return s / z; };
  let lo = -6, hi = 6;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (meanAt(mid) < target) lo = mid; else hi = mid; }
  const th = (lo + hi) / 2; let z = 0;
  const w = base.map(([v, p]) => { const x = p * Math.exp(th * v); z += x; return [v, x]; });
  return w.map(([v, x]) => [v, x / z]);
}
/* the chance of finishing above (or below) a line; a whole number can land on it, so the push is taken out */
function beyond(dist, line, above) {
  let a = 0, b = 0;
  for (const [v, p] of dist) { if (v > line + 1e-9) a += p; else if (v < line - 1e-9) b += p; }
  const win = above ? a : b, lose = above ? b : a;
  return win + lose > 0 ? win / (win + lose) : 0.5;
}
const marginBase = shape => shape.margin.reduce((out, [d, p]) => out.concat([[d, p / 2], [-d, p / 2]]), []);
function shapeProb(gm, shape, marketKey, outcome, home, away) {
  const isHome = outcome.name === home, isAway = outcome.name === away;
  if (marketKey === "h2h" || marketKey === "spreads") {
    if (!isHome && !isAway) return null;
    const d = tilt(marginBase(shape), gm.margin); /* home minus away */
    if (marketKey === "h2h") return r4(beyond(d, 0, isHome));
    const pt = Number(outcome.point); if (!Number.isFinite(pt)) return null;
    /* home covers when margin + point > 0; away covers when margin < point */
    return r4(isHome ? beyond(d, -pt, true) : beyond(d, pt, false));
  }
  if (marketKey === "totals") {
    const pt = Number(outcome.point); if (!Number.isFinite(pt)) return null;
    return r4(beyond(tilt(shape.total, gm.total), pt, /^over/i.test(outcome.name)));
  }
  return null;
}
function sideProb(gm, marketKey, outcome, home, away) {
  if (!gm || !outcome) return null;
  const cfg = SPORT[gm.sportKey], M = gm.margin, sd = gm.sd;
  if (cfg && cfg.shape) return shapeProb(gm, cfg.shape, marketKey, outcome, home, away);
  const isHome = outcome.name === home, isAway = outcome.name === away;
  if (marketKey === "h2h") {
    if (cfg.threeWay) {
      const b = cfg.drawBand;
      const pHome = 1 - Phi((b - M) / sd), pAway = Phi((-b - M) / sd), pDraw = Math.max(0, 1 - pHome - pAway);
      return isHome ? r4(pHome) : isAway ? r4(pAway) : /^draw$/i.test(outcome.name) ? r4(pDraw) : null;
    }
    if (!isHome && !isAway) return null;
    return r4(isHome ? 1 - Phi(-M / sd) : Phi(-M / sd));
  }
  if (marketKey === "spreads") {
    if (!isHome && !isAway) return null;
    const m = isHome ? M : -M, pt = Number(outcome.point); if (!Number.isFinite(pt)) return null;
    const whole = Math.abs(pt - Math.round(pt)) < 1e-9;
    return r4(whole ? pushAware((-pt + 0.5 - m) / sd, (-pt - 0.5 - m) / sd) : 1 - Phi((-pt - m) / sd));
  }
  if (marketKey === "totals") {
    const pt = Number(outcome.point); if (!Number.isFinite(pt)) return null;
    const over = /^over/i.test(outcome.name), T = gm.total, s = gm.sdTotal;
    const whole = Math.abs(pt - Math.round(pt)) < 1e-9;
    const pOver = whole ? pushAware((pt + 0.5 - T) / s, (pt - 0.5 - T) / s) : 1 - Phi((pt - T) / s);
    return r4(over ? pOver : 1 - pOver);
  }
  return null;
}
/* the reasons that bear on one side, split for and against */
function sideReasons(gm, marketKey, outcome, home, away) {
  if (!gm) return { for: [], against: [] };
  const isTotal = marketKey === "totals", over = isTotal && /^over/i.test(outcome.name);
  const mine = isTotal ? null : outcome.name === home ? "home" : outcome.name === away ? "away" : "draw";
  const out = { for: [], against: [] };
  gm.reasons.forEach(function (r) {
    if (isTotal) { if (r.side === "total") out.for.push(r.label); return; }
    if (r.side === "total") return;
    if (mine === "draw") { out.against.push(r.label); return; }
    (r.side === mine ? out.for : out.against).push(r.label);
  });
  if (isTotal) { const lineTxt = outcome.point != null ? " against " + outcome.point : ""; out[(over ? gm.total > Number(outcome.point) : gm.total < Number(outcome.point)) ? "for" : "against"].push("Projected total " + gm.total + lineTxt); }
  else if (mine !== "draw") { const m = mine === "home" ? gm.margin : -gm.margin; out[m > 0 ? "for" : "against"].push("Projected margin " + (m > 0 ? "+" : "") + r1(m) + " for " + outcome.name + (marketKey === "spreads" && outcome.point != null ? " against " + (outcome.point > 0 ? "+" : "") + outcome.point : "")); }
  if (gm.thin) out.against.push("Thin sample: only " + gm.gp + " game" + (gm.gp === 1 ? "" : "s") + " behind one of these teams");
  return out;
}

/* ---------- building a game's model from the context source (ESPN), with per-run caches ---------- */
async function forEvent(src, ctxlib, e, now, cache) {
  /* e: { sportKey, home, away, commence } */
  if (!SPORT[e.sportKey] || !ctxlib.ESPN[e.sportKey]) return null;
  cache.scoreboards = cache.scoreboards || {}; cache.schedules = cache.schedules || {}; cache.injuries = cache.injuries || {};
  const commenceMs = Date.parse(e.commence);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(commenceMs)).replace(/-/g, "");
  const sbKey = e.sportKey + "|" + day;
  if (!(sbKey in cache.scoreboards)) cache.scoreboards[sbKey] = await src.scoreboard(e.sportKey, day);
  const m = ctxlib.findEvent(cache.scoreboards[sbKey], e.home, e.away); if (!m) return null;
  const sched = async id => { const k = e.sportKey + "|" + id; if (!(k in cache.schedules)) cache.schedules[k] = await src.schedule(e.sportKey, id); return cache.schedules[k]; };
  const hs = await sched(m.home.team.id), as = await sched(m.away.team.id);
  if (!(e.sportKey in cache.injuries)) cache.injuries[e.sportKey] = await src.injuries(e.sportKey);
  const inj = cache.injuries[e.sportKey];
  /* a sport whose totals lean on the league's scoring reads it once a run from the standings (free, one request) */
  cache.league = cache.league || {};
  if (SPORT[e.sportKey].kTotal && !(e.sportKey in cache.league)) cache.league[e.sportKey] = typeof src.standings === "function" ? leagueGoalsFrom(await src.standings(e.sportKey)) : null;
  const ppgOf = cache.ppgOf || null;
  const gm = gameModel({ sportKey: e.sportKey, home: e.home, away: e.away, leagueGoals: cache.league[e.sportKey],
    homeForm: teamForm(hs, m.home.team.id, commenceMs), awayForm: teamForm(as, m.away.team.id, commenceMs),
    homeInjuries: ctxlib.teamInjuries(inj, e.home), awayInjuries: ctxlib.teamInjuries(inj, e.away),
    rest: { home: ctxlib.restFromSchedule(hs, m.home.team.id, commenceMs), away: ctxlib.restFromSchedule(as, m.away.team.id, commenceMs) }, ppgOf: ppgOf });
  if (gm) gm.espnEventId = m.event.id;
  return gm;
}
/* goals (points) per team-game across the league this season, from ESPN's standings; null until 100 team-games exist */
function leagueGoalsFrom(standings) {
  if (!standings) return null;
  let pf = 0, gp = 0;
  const walk = n => {
    if (n && n.standings && n.standings.entries) n.standings.entries.forEach(en => {
      const stat = name => { const s = (en.stats || []).find(x => x.name === name); return s ? Number(s.value) : NaN; };
      const f = stat("pointsFor"), g = stat("gamesPlayed"); if (Number.isFinite(f) && Number.isFinite(g) && g > 0) { pf += f; gp += g; }
    });
    ((n && n.children) || []).forEach(walk);
  };
  walk(standings);
  return gp >= 100 ? pf / gp : null;
}
/* NBA points per game by player name, from data/faces.js, so an injured scorer costs what he scores */
function ppgFromFaces(facesPath) {
  try { const fs = require("fs"), vm = require("vm"); const sb = { window: {} }; vm.runInNewContext(fs.readFileSync(facesPath, "utf8"), sb); const map = {}; (sb.window.FACES_DATA.players || []).forEach(p => { if (p.pts != null) map[String(p.name).toLowerCase()] = p.pts; }); return i => map[String(i.name || "").toLowerCase()] != null ? map[String(i.name || "").toLowerCase()] : null; } catch (e) { return null; }
}
function publicModel(gm) { return gm ? { margin: gm.margin, total: gm.total, sd: gm.sd, sdTotal: gm.sdTotal, gp: gm.gp, thin: gm.thin, parts: gm.parts } : null; }

module.exports = { SPORT, NHL_SHAPE, teamForm, rating, injuryCost, unseenShare, gameModel, sideProb, sideReasons, forEvent, ppgFromFaces, publicModel, Phi, implied, tilt, leagueGoalsFrom };
