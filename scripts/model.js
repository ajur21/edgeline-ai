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
/* The other leagues’ own final scores (ESPN regular seasons; calibrated 2026-11-04 on results only, never prices).
   NFL 2023-2025 (816 games): finals pile up on 3 (14% of games, against 6% on a normal curve) and on 7, so the
   margin table carries those key numbers (a quarter smoothed toward the curve, the sample being thin); totals stay on
   the curve. MLB 2024-2026 (7288 games): one-run finals are 28% (17% on a curve). The home side’s own margins
   are kept as they are, not mirrored: the home team does not bat in the ninth when ahead and a walk-off ends at one
   run, so home teams win 53.1% while out-scoring visitors by 0.034 runs a game, which a mirrored shape
   cannot hold (held out, the mirrored table put home teams at 50%). EPL 2023-24 to 2025-26 (1102 matches): 24.7%
   draws; margins and totals half smoothed toward the curve. */
const NFL_SHAPE = { margin: [[0,0.0084],[1,0.05444],[2,0.05707],[3,0.12121],[4,0.05198],[5,0.05255],[6,0.06315],[7,0.07554],[8,0.04283],[9,0.0211],[10,0.04255],[11,0.01892],[12,0.02285],[13,0.02493],[14,0.04172],[15,0.01714],[16,0.02016],[17,0.04341],[18,0.02257],[19,0.01554],[20,0.01865],[21,0.02088],[22,0.01303],[23,0.01809],[24,0.01951],[25,0.01362],[26,0.00776],[27,0.00745],[28,0.01268],[29,0.00417],[30,0.00395],[31,0.01112],[32,0.00544],[33,0.00254],[34,0.00886],[35,0.00232],[36,0.00039],[37,0.00308],[38,0.00394],[39,0.00021],[40,0.00109],[41,0.00013],[42,0.00102],[43,0.00008],[44,0.00007],[45,0.00189]] };
const MLB_SHAPE = { marginHome: [[-14,0.0037],[-13,0.00206],[-12,0.00384],[-11,0.00398],[-10,0.00782],[-9,0.00878],[-8,0.01756],[-7,0.02264],[-6,0.03321],[-5,0.04281],[-4,0.05488],[-3,0.06998],[-2,0.0896],[-1,0.10812],[1,0.17412],[2,0.09125],[3,0.06655],[4,0.0579],[5,0.04212],[6,0.0306],[7,0.02415],[8,0.01372],[9,0.01029],[10,0.00714],[11,0.00439],[12,0.00261],[13,0.00192],[14,0.00425]], total: [[1,0.0188],[2,0.0199],[3,0.06216],[4,0.04871],[5,0.09879],[6,0.07451],[7,0.11389],[8,0.07519],[9,0.09769],[10,0.06627],[11,0.07519],[12,0.04748],[13,0.05351],[14,0.0354],[15,0.0306],[16,0.02319],[17,0.0166],[18,0.01194],[19,0.0081],[20,0.00686],[21,0.00494],[22,0.00274],[23,0.00247],[24,0.00137],[25,0.00137],[26,0.00082],[27,0.00041],[28,0.00027],[29,0.00041],[30,0.00014],[32,0.00027]] };
const EPL_SHAPE = { margin: [[0,0.23844],[1,0.37178],[2,0.23222],[3,0.10871],[4,0.03333],[5,0.01222],[6,0.0033]], total: [[0,0.04855],[1,0.12589],[2,0.21879],[3,0.23765],[4,0.19406],[5,0.10925],[6,0.04424],[7,0.0165],[8,0.00398],[9,0.00108],[10,0.00002],[11,0]] };
/* per-sport numbers: home edge and adjustments in the sport's points; sd = spread of the final margin and total (the
   normal curve, where a league's own shape is not used, and the reasons' thresholds).
   k: games of evidence before a team's margin counts half (shrinkage toward even); form: the weight on the last five;
   kTotal: games of evidence before a team's scoring average counts half against the league's (ESPN standings, with
   leagueGoals per team-game as the fallback); shape: the league's own final scores, per market.
   Every league calibrated 2026-11-04 on ESPN final scores only, never prices: fitted on one full season, tested on the
   others. Recent form earned a weight of 0 to 0.1 everywhere (it was 0.4). NBA (3 seasons, 3,693 games): form 0.1,
   home edge 1.9, the curve's spread 14.3 points (12.5 was overconfident), totals on raw averages. NFL (3 seasons): k 6,
   form 0.1, home 2.3, totals pulled toward the league by 5 games, margins from NFL_SHAPE. NHL: k 35 (a 16-game goal
   differential is mostly noise). MLB (3 seasons): k 60 and no form (the old k 10 / form 0.4 predicted margins worse
   than no rating at all), totals pulled by 20 games, both markets from MLB_SHAPE. EPL (3 seasons): k 8, form 0.1, home
   0.24, totals pulled by 30 games, both markets from EPL_SHAPE (draws a quarter of matches).
   carry: a team starts from part of last season's margin per game (c) instead of from zero, weighted as carry.k games,
   so the first weeks of a season lean on last season rather than on a handful of games (fitted 2026-11-05 on held-out
   seasons, results only: early-season error fell about 5% in the NBA, 3% in the NFL, 5% in the EPL; NHL kept to a
   quarter of last season, the fit from its one full held-out season). A team with no last season in the league (a
   promoted club) keeps the old k and starts from zero.
   scoringOut: injuries take nothing off a total, except an NFL quarterback out (2 points). A league’s scoring average
   already carries its usual injury load, and the per-player deductions pulled every total under: on 2026-11-05’s slates
   the NFL’s projected totals averaged 35.4 against a league 46.1, the NBA’s 5 points low, the NHL’s 0.4 goals low.
   Injury costs on the margin stay (both sides carry injuries, so they do not tilt one way). */
const SPORT = {
  basketball_nba:        { homeEdge: 1.9, sd: 14.3, sdTotal: 19, k: 6, form: 0.1, carry: { k: 10, c: 0.6 }, b2b: -1.5, rest3: 0.5,  out: (i, ppg) => ppg != null ? 0.12 * ppg : 1.2, soft: 0.5, scoringOut: () => 0 },
  americanfootball_nfl:  { homeEdge: 2.3, sd: 13.3, sdTotal: 13.4, k: 6, form: 0.1, carry: { k: 6, c: 0.4 }, kTotal: 5, leagueGoals: 22.6, shape: NFL_SHAPE, b2b: 0, rest3: 0, out: i => /QB/.test(i.pos || "") ? 4 : 0.5, soft: 0.5, scoringOut: (ppg, i) => /QB/.test((i && i.pos) || "") ? 2 : 0, single: /QB/ },
  icehockey_nhl:         { homeEdge: 0.24, sd: 2.4, sdTotal: 2.3, k: 35, form: 0.1, carry: { k: 40, c: 0.25 }, kTotal: 80, leagueGoals: 3.1, shape: NHL_SHAPE, b2b: -0.25, rest3: 0.05, out: i => (i.pos || "") === "G" ? 0.5 : 0.12, soft: 0.5, scoringOut: () => 0, single: /^G$/ },
  baseball_mlb:          { homeEdge: 0.03, sd: 4.5, sdTotal: 4.5, k: 60, form: 0, carry: { k: 80, c: 0.5 }, kTotal: 20, leagueGoals: 4.44, shape: MLB_SHAPE, b2b: 0, rest3: 0, out: i => /^(SP|P|RP)$/.test(i.pos || "") ? 0.3 : 0.12, soft: 0.5, scoringOut: () => 0 },
  soccer_epl:            { homeEdge: 0.24, sd: 1.7, sdTotal: 1.6, k: 8, form: 0.1, carry: { k: 15, c: 0.75 }, kTotal: 30, leagueGoals: 1.49, shape: EPL_SHAPE, b2b: 0, rest3: 0.05, out: () => 0.15, soft: 0.5, scoringOut: () => 0, threeWay: true, drawBand: 0.5 }
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
    /* regular season only: type 2 in the US leagues; soccer marks league matches with the season's own id (11864, 13481...),
       which the old "!== 2" test threw away, so no Premier League game ever had a model */
    const st = Number((e.seasonType && e.seasonType.type) || (e.season && e.season.type)); if (Number.isFinite(st) && st !== 2 && st < 10) continue;
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
function rating(form, cfg, prior) {
  const p = Number.isFinite(prior) && cfg.carry ? cfg.carry : null;
  if (!form || !form.gp) return p ? p.c * prior : 0;
  const w = cfg.form != null ? cfg.form : 0.4, raw = (1 - w) * form.margin + w * form.last5;
  /* with last season's margin, the season so far leans on part of it (c) as carry.k games of evidence; without it, on zero */
  return p ? (form.gp * raw + p.k * p.c * prior) / (form.gp + p.k) : raw * (form.gp / (form.gp + cfg.k));
}
/* the season before a game, as ESPN numbers it in each league's schedule URL: the NBA and NHL by the year a season ends,
   the NFL and the Premier League by the year it starts, MLB by its calendar year */
function lastSeasonParam(sportKey, commenceMs) {
  const d = new Date(commenceMs); if (isNaN(d)) return null;
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
  if (sportKey === "basketball_nba" || sportKey === "icehockey_nhl") return String((m >= 8 ? y + 1 : y) - 1);
  if (sportKey === "americanfootball_nfl") return String((m >= 3 ? y : y - 1) - 1);
  if (sportKey === "soccer_epl") return String((m >= 7 ? y : y - 1) - 1);
  if (sportKey === "baseball_mlb") return String(y - 1);
  return null;
}

/* ---------- injuries in the sport's points ---------- */
/* cfg.single: a position only one player fills at a time (an NHL goalie, an NFL quarterback). A team loses its starter
   once however many of them are listed, so only the costliest listing at that position counts.
   weightOf(i): the share of the team's results that still had the player (see unseenShare). A player who has missed
   every game is already in every result, so he costs nothing more; one who played them all costs in full. Only players
   who still move the number (a share of a fifth or more) are named in the reasons. */
function injuryCost(list, cfg, ppgOf, weightOf) {
  let cost = 0, scoring = 0, oneCost = 0, oneScoring = 0; const out = [], soft = [];
  (list || []).forEach(function (i) {
    const ppg = ppgOf ? ppgOf(i) : null, one = !!(cfg.single && cfg.single.test(i.pos || ""));
    const w = weightOf ? Math.max(0, Math.min(1, weightOf(i))) : 1, label = i.name + (i.pos ? " (" + i.pos + ")" : "");
    let c, s;
    if (SEVERE.test(i.status || "")) { c = cfg.out(i, ppg) * w; s = cfg.scoringOut(ppg, i) * w; if (w >= 0.2) out.push(label); }
    else if (SOFT.test(i.status || "")) { c = cfg.soft * cfg.out(i, ppg) * w; s = 0.5 * cfg.scoringOut(ppg, i) * w; if (w >= 0.2) soft.push(label); }
    else return;
    if (one) { oneCost = Math.max(oneCost, c); oneScoring = Math.max(oneScoring, s); } else { cost += c; scoring += s; }
  });
  return { cost: cost + oneCost, scoring: scoring + oneScoring, out: out, soft: soft };
}
/* how much of a team's season so far was played with a now-listed player. Since 2026-11-05 that is the games he played:
   i.played (from his game log, see playedIn) over the team's games, so a player who has missed every game costs
   nothing and one who played them all costs in full. Before, it was the games before the listing date, but ESPN
   re-dates its entries every few days: on 2026-11-05, 41 of the 91 NBA players it listed had not played a game this
   season, and the listing date still charged 22 of them half or more (Porzingis, 0 of 8, listed the day before). The
   listing date stays as the fallback when there is no game log; no date (or no games) counts the absence in full. */
function unseenShare(form) {
  return function (i) {
    if (!form || !form.gp || !form.games) return 1;
    if (i && Number.isFinite(i.played)) return Math.max(0, Math.min(1, i.played / form.gp));
    const t = Date.parse((i && i.date) || "");
    if (!Number.isFinite(t)) return 1;
    return form.games.filter(g => g.date < t).length / form.gp;
  };
}
/* the team's games this season that had a listed player: his appearances (ctx.appearances, from his game log) among the
   games teamForm counts (regular season, completed, before this game), matched by event id and played for this club,
   so a preseason game, a cup tie or a game for his old club never counts. A pitcher appears by turn (a healthy starter
   in one game in five), so his count is the stretch of the team's games from his first appearance to his last.
   null when his appearances are unknown (the caller keeps the listing date). */
const BY_TURN = { baseball_mlb: /^(SP|RP|P)$/ };
/* his appearances for this club among the team's counted games, oldest first, as [index in the team's games, appearance] */
function countedApps(apps, sched, form, teamId) {
  const counted = new Set(form.games.map(g => g.date));
  const order = ((sched && sched.events) || []).filter(ev => counted.has(Date.parse(ev.date))).sort((a, b) => Date.parse(a.date) - Date.parse(b.date)).map(ev => String(ev.id));
  const mine = {}; apps.filter(a => a.team == null || String(a.team) === String(teamId)).forEach(a => { mine[a.id] = a; });
  return order.map((id, k) => mine[id] ? [k, mine[id]] : null).filter(Boolean);
}
function playedIn(apps, sched, form, teamId, sportKey, pos) {
  if (!apps || !form || !form.games) return null;
  const at = countedApps(apps, sched, form, teamId).map(x => x[0]);
  if (!at.length) return 0;
  return BY_TURN[sportKey] && BY_TURN[sportKey].test(pos || "") ? at[at.length - 1] - at[0] + 1 : at.length;
}
/* his points a game this season, from the same game log: the mean over the games he played that the team's rating counts
   (regular season, for this club). null without a points column or without a game (a player who has not played costs
   nothing anyway, through the played share). The NBA cost reads it when data/faces.js has no points for him */
function ppgIn(apps, sched, form, teamId) {
  if (!apps || !form || !form.games) return null;
  const pts = countedApps(apps, sched, form, teamId).map(x => x[1].pts).filter(v => typeof v === "number" && Number.isFinite(v));
  return pts.length ? pts.reduce((s, x) => s + x, 0) / pts.length : null;
}

/* ---------- the game: expected margin (home minus away) and total ---------- */
function gameModel(input) {
  const cfg = SPORT[input.sportKey]; if (!cfg) return null;
  const hf = input.homeForm, af = input.awayForm;
  if (!hf || !af || !hf.gp || !af.gp) return null;
  const lastH = input.homeLast, lastA = input.awayLast;
  const rh = rating(hf, cfg, lastH), ra = rating(af, cfg, lastA);
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
  const lastTxt = (Number.isFinite(lastH) || Number.isFinite(lastA)) && cfg.carry ? "; last season " + (Number.isFinite(lastH) ? fmt(lastH) : "none") + " and " + (Number.isFinite(lastA) ? fmt(lastA) : "none") + " a game" : "";
  reasons.push({ side: rh >= ra ? "home" : "away", label: input.home + " rate " + fmt(rh) + " a game over " + hf.gp + " (" + hf.wins + "-" + hf.losses + "), " + input.away + " " + fmt(ra) + " over " + af.gp + " (" + af.wins + "-" + af.losses + ")" + lastTxt });
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
  /* margin and total at full precision: sideProb and noise price on them (rounded to 0.1 first, an NHL moneyline moved in
     steps of about 1.7 points). Only what is shown is rounded: the reasons, publicModel, the rationale */
  return { sportKey: input.sportKey, home: input.home, away: input.away, margin: margin, total: total, sd: cfg.sd, sdTotal: cfg.sdTotal, gp: Math.min(hf.gp, af.gp), gpHome: hf.gp, gpAway: af.gp,
    parts: { ratingHome: r1(rh), ratingAway: r1(ra), lastHome: Number.isFinite(lastH) ? r1(lastH) : null, lastAway: Number.isFinite(lastA) ? r1(lastA) : null, homeEdge: cfg.homeEdge, rest: r1(restAdj), injuriesHome: r1(-ih.cost), injuriesAway: r1(ia.cost), scoringOut: r1(ih.scoring + ia.scoring), pace: r1(pace / 2) },
    reasons: reasons, thin: Math.min(hf.gp, af.gp) < 4 };
}

/* ---------- a side's probability ---------- */
/* a line that can push: the win and loss bands either side of the number, renormalised */
function pushAware(z, loseZ) { const w = 1 - Phi(z), l = Phi(loseZ); return w + l > 0 ? w / (w + l) : 0.5; }
/* a discrete distribution ([[value, p], ...]) moved to a target mean by exponential tilting: the league's shape, this game's centre */
function tilt(base, target) {
  if (!Number.isFinite(target)) return base;
  const c = base.reduce((s, x) => s + x[0] * x[1], 0); /* centred, so totals in the hundreds cannot overflow the exponent */
  const meanAt = th => { let z = 0, s = 0; for (const [v, p] of base) { const w = p * Math.exp(th * (v - c)); z += w; s += w * v; } return s / z; };
  let lo = -6, hi = 6;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (meanAt(mid) < target) lo = mid; else hi = mid; }
  const th = (lo + hi) / 2; let z = 0;
  const w = base.map(([v, p]) => { const x = p * Math.exp(th * (v - c)); z += x; return [v, x]; });
  return w.map(([v, x]) => [v, x / z]);
}
/* the chance of finishing above (or below) a line; a whole number can land on it, so the push is taken out */
function beyond(dist, line, above) {
  let a = 0, b = 0;
  for (const [v, p] of dist) { if (v > line + 1e-9) a += p; else if (v < line - 1e-9) b += p; }
  const win = above ? a : b, lose = above ? b : a;
  return win + lose > 0 ? win / (win + lose) : 0.5;
}
/* the margin table is folded (|margin|, both ways share it); a 0 row is a tie or a draw and stays whole. marginHome is
   the home side's own margins, kept as they are (MLB: the home side's ninth and the walk-off make it lopsided) */
const marginBase = shape => shape.marginHome ? shape.marginHome : shape.margin.reduce((out, [d, p]) => d === 0 ? out.concat([[0, p]]) : out.concat([[d, p / 2], [-d, p / 2]]), []);
function shapeProb(gm, shape, marketKey, outcome, home, away, threeWay) {
  const isHome = outcome.name === home, isAway = outcome.name === away, isDraw = /^draw$/i.test(outcome.name || "");
  if (marketKey === "h2h" || marketKey === "spreads") {
    if (!isHome && !isAway && !(isDraw && marketKey === "h2h" && threeWay)) return null;
    const d = tilt(marginBase(shape), gm.margin); /* home minus away */
    if (marketKey === "h2h" && threeWay) { /* soccer: home, draw and away, summing to one */
      const p = d.reduce((s, x) => { if (x[0] > 0) s.h += x[1]; else if (x[0] < 0) s.a += x[1]; else s.d += x[1]; return s; }, { h: 0, d: 0, a: 0 });
      return r4(isHome ? p.h : isAway ? p.a : p.d);
    }
    if (marketKey === "h2h") return r4(beyond(d, 0, isHome)); /* a two-way moneyline: a tie is a push */
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
  const cfg = SPORT[gm.sportKey], M = gm.margin, sd = gm.sd || (cfg && cfg.sd);
  /* a league's own shape where the calibration chose it, per market: the margin table for moneylines and spreads, the
     total table for totals; the normal curve otherwise */
  const shape = cfg && cfg.shape;
  if (shape && (shape.margin || shape.marginHome) && (marketKey === "h2h" || marketKey === "spreads")) return shapeProb(gm, shape, marketKey, outcome, home, away, cfg.threeWay);
  if (shape && shape.total && marketKey === "totals") return shapeProb(gm, shape, marketKey, outcome, home, away, cfg.threeWay);
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
    const over = /^over/i.test(outcome.name), T = gm.total, s = gm.sdTotal || (cfg && cfg.sdTotal);
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
  /* shown to one decimal; to two where one decimal would land on the number it is judged against (222.46 against 222.5
     reads "222.46", not "222.5 against 222.5"; a margin of 0.04 reads "+0.04") */
  const shown = (x, at) => r1(x) === at ? Math.round(x * 100) / 100 : r1(x);
  if (isTotal) { const lineTxt = outcome.point != null ? " against " + outcome.point : ""; out[(over ? gm.total > Number(outcome.point) : gm.total < Number(outcome.point)) ? "for" : "against"].push("Projected total " + shown(gm.total, Number(outcome.point)) + lineTxt); }
  else if (mine !== "draw") { const m = mine === "home" ? gm.margin : -gm.margin; out[m > 0 ? "for" : "against"].push("Projected margin " + (m > 0 ? "+" : "") + shown(m, 0) + " for " + outcome.name + (marketKey === "spreads" && outcome.point != null ? " against " + (outcome.point > 0 ? "+" : "") + outcome.point : "")); }
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
  /* last season's margin per game for each club (free, one request a club a run; none in the fixtures) */
  const prevSeason = SPORT[e.sportKey].carry ? lastSeasonParam(e.sportKey, commenceMs) : null;
  cache.lastSeason = cache.lastSeason || {};
  const last = async id => {
    if (!prevSeason || typeof src.scheduleSeason !== "function") return null;
    const k = e.sportKey + "|" + id + "|" + prevSeason;
    if (!(k in cache.lastSeason)) { const f = teamForm(await src.scheduleSeason(e.sportKey, id, prevSeason), id, null); cache.lastSeason[k] = f && f.gp >= 10 ? f.margin : null; }
    return cache.lastSeason[k];
  };
  const lastH = await last(m.home.team.id), lastA = await last(m.away.team.id);
  if (!(e.sportKey in cache.injuries)) cache.injuries[e.sportKey] = await src.injuries(e.sportKey);
  const inj = cache.injuries[e.sportKey];
  /* a sport whose totals lean on the league's scoring reads it once a run from the standings (free, one request) */
  cache.league = cache.league || {};
  if (SPORT[e.sportKey].kTotal && !(e.sportKey in cache.league)) cache.league[e.sportKey] = typeof src.standings === "function" ? leagueGoalsFrom(await src.standings(e.sportKey)) : null;
  const ppgOf = cache.ppgOf || null;
  const hf = teamForm(hs, m.home.team.id, commenceMs), af = teamForm(as, m.away.team.id, commenceMs);
  /* the games each costed listing played this season, from his game log (free, one request a player a run, cached by
     player): `played` on the listing, which unseenShare reads. A listing that costs nothing anyway, has no id, or whose
     log cannot be read is left as it is, and the listing date stands in */
  const cur = lastSeasonParam(e.sportKey, commenceMs), season = cur == null ? null : String(Number(cur) + 1);
  cache.gamelogs = cache.gamelogs || {};
  const withPlayed = async (list, sched, form, teamId) => {
    const cfg = SPORT[e.sportKey], out = [];
    for (const i of list) {
      const costed = (SEVERE.test(i.status || "") || SOFT.test(i.status || "")) && cfg.out(i, ppgOf ? ppgOf(i) : null) > 0;
      if (!costed || !i.athleteId || !season || typeof src.gamelog !== "function" || typeof ctxlib.appearances !== "function") { out.push(i); continue; }
      const k = e.sportKey + "|" + i.athleteId;
      if (!(k in cache.gamelogs)) { let log = null; try { log = await src.gamelog(e.sportKey, i.athleteId); } catch (err) { log = null; } cache.gamelogs[k] = ctxlib.appearances(log, season); }
      const played = playedIn(cache.gamelogs[k], sched, form, teamId, e.sportKey, i.pos), logPpg = ppgIn(cache.gamelogs[k], sched, form, teamId);
      out.push(played == null ? i : Object.assign({}, i, { played: played }, logPpg != null ? { logPpg: logPpg } : {}));
    }
    return out;
  };
  const homeInjuries = await withPlayed(ctxlib.teamInjuries(inj, e.home), hs, hf, m.home.team.id), awayInjuries = await withPlayed(ctxlib.teamInjuries(inj, e.away), as, af, m.away.team.id);
  /* a scorer's points a game: data/faces.js first, then his own game log this season (faces.js has none for a player listed
     Out and covers only the props run's clubs), then nothing, which the sport's cost reads as its default (NBA 1.2) */
  const ppgFor = i => { const f = ppgOf ? ppgOf(i) : null; return f != null ? f : i && Number.isFinite(i.logPpg) ? i.logPpg : null; };
  const gm = gameModel({ sportKey: e.sportKey, home: e.home, away: e.away, leagueGoals: cache.league[e.sportKey], homeLast: lastH, awayLast: lastA,
    homeForm: hf, awayForm: af, homeInjuries: homeInjuries, awayInjuries: awayInjuries,
    rest: { home: ctxlib.restFromSchedule(hs, m.home.team.id, commenceMs), away: ctxlib.restFromSchedule(as, m.away.team.id, commenceMs) }, ppgOf: ppgFor });
  if (gm) { gm.espnEventId = m.event.id; gm.injuries = { home: homeInjuries, away: awayInjuries }; }
  return gm;
}
/* goals (points) per team-game across the league this season, from ESPN's standings; null until 100 team-games exist */
function leagueGoalsFrom(standings) {
  if (!standings) return null;
  let pf = 0, gp = 0;
  const walk = n => {
    if (n && n.standings && n.standings.entries) n.standings.entries.forEach(en => {
      const stat = name => { const s = (en.stats || []).find(x => x.name === name); return s ? Number(s.value) : NaN; };
      /* the NBA and NFL tables carry no games played: wins, losses and ties add up to it */
      let g = stat("gamesPlayed"); if (!(g > 0)) g = ["wins", "losses", "ties", "otLosses"].map(stat).filter(Number.isFinite).reduce((s, x) => s + x, 0);
      const f = stat("pointsFor"); if (Number.isFinite(f) && g > 0) { pf += f; gp += g; }
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
function publicModel(gm) { return gm ? { margin: r1(gm.margin), total: r1(gm.total), sd: gm.sd, sdTotal: gm.sdTotal, gp: gm.gp, gpHome: gm.gpHome, gpAway: gm.gpAway, thin: gm.thin, parts: gm.parts } : null; }

/* ---------- the model's own error on a side (Phase 2, 2026-11-05: the bar a pick must clear) ----------
   How far our probability could sit from what these two teams really are, from the size of the sample alone: the
   standard error of the rating difference behind the margin (each team's games this season plus the prior's weight in
   games: last season's carry-over where the club has one, else the shrinkage k) or of the four scoring averages behind
   the total (kTotal games toward the league), moved through this side's own probability at its line, one error each
   way. Injuries, lineups and matchups add error on top, so this is a floor. Checked 2026-11-05 against held-out seasons
   (results only, each club's season with the game left out as the truth): early in a season (7 games each) the formula
   gives NBA 4.9 / NHL 0.50 / MLB 0.68 / EPL 0.51 on the margin against a measured 5.4 / 0.52 / 0.63 / 0.60; the NFL's
   5.2 is above its measured 3.3 (cautious). Mid-season (27 games) NBA 3.3 against a measured 3.3.
   Returns { p (probability points as a fraction), units (on the margin or total), unit, gp (fewest games behind a team) }. */
const UNIT = { basketball_nba: "points", americanfootball_nfl: "points", icehockey_nhl: "goals", baseball_mlb: "runs", soccer_epl: "goals" };
function noise(gm, marketKey, outcome, home, away) {
  const cfg = gm && SPORT[gm.sportKey]; if (!cfg || !outcome) return null;
  const gh = Number(gm.gpHome != null ? gm.gpHome : gm.gp), ga = Number(gm.gpAway != null ? gm.gpAway : gm.gp);
  if (!(gh > 0) || !(ga > 0)) return null;
  const parts = gm.parts || {};
  const kOf = last => cfg.carry && last != null && Number.isFinite(Number(last)) ? cfg.carry.k : cfg.k;
  const isTotal = marketKey === "totals", key = isTotal ? "total" : "margin";
  const kT = cfg.kTotal || 0;
  const units = isTotal ? (gm.sdTotal || cfg.sdTotal) / 2 * Math.sqrt(1 / (gh + kT) + 1 / (ga + kT))
    : (gm.sd || cfg.sd) * Math.sqrt(1 / (gh + kOf(parts.lastHome)) + 1 / (ga + kOf(parts.lastAway)));
  const at = d => sideProb(Object.assign({}, gm, { [key]: gm[key] + d }), marketKey, outcome, home, away);
  const p0 = sideProb(gm, marketKey, outcome, home, away), up = at(units), dn = at(-units);
  if (p0 == null || up == null || dn == null) return null;
  /* the mean move either way, so a draw (which falls whichever way the margin moves) still gets its error */
  return { p: r4((Math.abs(up - p0) + Math.abs(dn - p0)) / 2), units: Math.round(units * 100) / 100, unit: UNIT[gm.sportKey] || "points", gp: Math.min(gh, ga) };
}

module.exports = { SPORT, NHL_SHAPE, noise, teamForm, rating, lastSeasonParam, injuryCost, unseenShare, playedIn, gameModel, sideProb, sideReasons, forEvent, ppgFromFaces, publicModel, Phi, implied, tilt, leagueGoalsFrom };
