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

/* per-sport numbers: home edge and adjustments in the sport's points; sd = spread of the final margin and total */
const SPORT = {
  basketball_nba:        { homeEdge: 2.5, sd: 12.5, sdTotal: 19, k: 6,  b2b: -1.5, rest3: 0.5,  out: (i, ppg) => ppg != null ? 0.12 * ppg : 1.2, soft: 0.5, scoringOut: ppg => ppg != null ? 0.15 * ppg : 1.5 },
  americanfootball_nfl:  { homeEdge: 2.0, sd: 13.5, sdTotal: 14, k: 3,  b2b: 0,    rest3: 0,    out: i => /QB/.test(i.pos || "") ? 4 : 0.5, soft: 0.5, scoringOut: () => 1, single: /QB/ },
  icehockey_nhl:         { homeEdge: 0.2, sd: 2.4,  sdTotal: 2.3, k: 8, b2b: -0.25, rest3: 0.05, out: i => (i.pos || "") === "G" ? 0.5 : 0.12, soft: 0.5, scoringOut: () => 0.1, single: /^G$/ },
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
function rating(form, cfg) { if (!form || !form.gp) return 0; const raw = 0.6 * form.margin + 0.4 * form.last5; return raw * (form.gp / (form.gp + cfg.k)); }

/* ---------- injuries in the sport's points ---------- */
/* cfg.single: a position only one player fills at a time (an NHL goalie, an NFL quarterback). A team loses its starter
   once however many of them are listed, so only the costliest listing at that position counts; every name is still listed. */
function injuryCost(list, cfg, ppgOf) {
  let cost = 0, scoring = 0, oneCost = 0, oneScoring = 0; const out = [], soft = [];
  (list || []).forEach(function (i) {
    const ppg = ppgOf ? ppgOf(i) : null, one = !!(cfg.single && cfg.single.test(i.pos || ""));
    let c, s;
    if (SEVERE.test(i.status || "")) { c = cfg.out(i, ppg); s = cfg.scoringOut(ppg); out.push(i.name + (i.pos ? " (" + i.pos + ")" : "")); }
    else if (SOFT.test(i.status || "")) { c = cfg.soft * cfg.out(i, ppg); s = 0.5 * cfg.scoringOut(ppg); soft.push(i.name + (i.pos ? " (" + i.pos + ")" : "")); }
    else return;
    if (one) { oneCost = Math.max(oneCost, c); oneScoring = Math.max(oneScoring, s); } else { cost += c; scoring += s; }
  });
  return { cost: cost + oneCost, scoring: scoring + oneScoring, out: out, soft: soft };
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
  const ih = injuryCost(input.homeInjuries, cfg, input.ppgOf), ia = injuryCost(input.awayInjuries, cfg, input.ppgOf);
  const margin = rh - ra + cfg.homeEdge + restAdj - ih.cost + ia.cost;
  const total = (hf.pf + af.pa + af.pf + hf.pa) / 2 - (ih.scoring + ia.scoring);
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
  reasons.push({ side: "total", label: "Combined scoring " + r1(hf.pf + hf.pa) + " a game in " + input.home + "'s games, " + r1(af.pf + af.pa) + " in " + input.away + "'s" + (ih.scoring + ia.scoring >= cfg.sdTotal / 10 ? "; scorers out take " + r1(ih.scoring + ia.scoring) + " off" : "") });
  return { sportKey: input.sportKey, home: input.home, away: input.away, margin: r1(margin), total: r1(total), sd: cfg.sd, sdTotal: cfg.sdTotal, gp: Math.min(hf.gp, af.gp),
    parts: { ratingHome: r1(rh), ratingAway: r1(ra), homeEdge: cfg.homeEdge, rest: r1(restAdj), injuriesHome: r1(-ih.cost), injuriesAway: r1(ia.cost), scoringOut: r1(ih.scoring + ia.scoring), pace: r1(pace / 2) },
    reasons: reasons, thin: Math.min(hf.gp, af.gp) < 4 };
}

/* ---------- a side's probability ---------- */
/* a line that can push: the win and loss bands either side of the number, renormalised */
function pushAware(z, loseZ) { const w = 1 - Phi(z), l = Phi(loseZ); return w + l > 0 ? w / (w + l) : 0.5; }
function sideProb(gm, marketKey, outcome, home, away) {
  if (!gm || !outcome) return null;
  const cfg = SPORT[gm.sportKey], M = gm.margin, sd = gm.sd;
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
  const ppgOf = cache.ppgOf || null;
  const gm = gameModel({ sportKey: e.sportKey, home: e.home, away: e.away,
    homeForm: teamForm(hs, m.home.team.id, commenceMs), awayForm: teamForm(as, m.away.team.id, commenceMs),
    homeInjuries: ctxlib.teamInjuries(inj, e.home), awayInjuries: ctxlib.teamInjuries(inj, e.away),
    rest: { home: ctxlib.restFromSchedule(hs, m.home.team.id, commenceMs), away: ctxlib.restFromSchedule(as, m.away.team.id, commenceMs) }, ppgOf: ppgOf });
  if (gm) gm.espnEventId = m.event.id;
  return gm;
}
/* NBA points per game by player name, from data/faces.js, so an injured scorer costs what he scores */
function ppgFromFaces(facesPath) {
  try { const fs = require("fs"), vm = require("vm"); const sb = { window: {} }; vm.runInNewContext(fs.readFileSync(facesPath, "utf8"), sb); const map = {}; (sb.window.FACES_DATA.players || []).forEach(p => { if (p.pts != null) map[String(p.name).toLowerCase()] = p.pts; }); return i => map[String(i.name || "").toLowerCase()] != null ? map[String(i.name || "").toLowerCase()] : null; } catch (e) { return null; }
}
function publicModel(gm) { return gm ? { margin: gm.margin, total: gm.total, sd: gm.sd, sdTotal: gm.sdTotal, gp: gm.gp, thin: gm.thin, parts: gm.parts } : null; }

module.exports = { SPORT, teamForm, rating, injuryCost, gameModel, sideProb, sideReasons, forEvent, ppgFromFaces, publicModel, Phi, implied };
