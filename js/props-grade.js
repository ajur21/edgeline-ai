/* ==========================================================================
   EdgeLine AI: the props grade, one module for the page and the pipeline.
   props.html loads it as window.EdgeLineProps; Node requires it
   (require("../js/props-grade.js")) and gets the same functions.

   The rule (owner decision, 2026-11-04): a prop is graded on game data only,
   never against other books' prices. The posted line is the number to clear;
   a price rides along only so the reader knows where to bet.

   Pure: no DOM, no storage, no clock. Whatever a function needs from outside
   one player is passed in:
     line  the number to clear, always explicit: the posted line
           (postedLine(p, k)) or one the reader typed
     now   the caller's clock in ms (EdgeLine.now() on the page), for
           "has this game started"; left out, nothing is treated as started
     ctx   context(PROPS_DATA): the slate's facts a single player does not
           carry: { leaguePA, starts, stats }. leaguePA is the mean points
           allowed across the slate's NBA opponents, which scales every NBA
           projection, so pass ctx wherever it is accepted; without it the
           grade falls back to 113 and will not match the page.

   Typical use:
     var G = EdgeLineProps, ctx = G.context(PROPS_DATA);
     G.sideFor(p, "pts", G.postedLine(p, "pts"), ctx)   one stat at one number
     G.bestSide(p, { now: Date.now(), ctx: ctx })        the board's side for a player
     sides.sort(function (a, b) { return G.better(a, b, ctx); })   the board's order

   Exports are a contract with scripts/ (the pipeline grades with them):
   add names, never rename or remove one.
   ========================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module && module.exports) module.exports = api;
  else root.EdgeLineProps = api;
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ---------- leagues and stats ---------- */
  /* every entry carries its league; a file written before the NFL has none and is the NBA */
  function leagueOf(x) { return (x && x.league) || "NBA"; }
  function isNFL(p) { return leagueOf(p) === "NFL"; }
  var NBA_KEYS = ["pts", "reb", "ast", "threes", "pra"];
  /* the stats a player is graded on, in order: the ones the pipeline listed for him (an NFL player's position), else the
     league's list from the data (ctx.stats), else the NBA's five */
  function keysOf(p, ctx) {
    if (p && Array.isArray(p.keys)) return p.keys;
    if (isNFL(p)) return [];
    var listed = ctx && ctx.stats && ctx.stats[leagueOf(p)];
    return listed && listed.length ? listed : NBA_KEYS;
  }
  /* a stat's value in one game-log row. A key the row does not carry under its own name is looked up under the box
     score's name for it (a pass-attempts market reads the row's att), so a new market still has a history */
  var LOG_ALIAS = { passAtt: "att", attempts: "att", passCmp: "cmp", completions: "cmp", rushAtt: "car", carries: "car", targets: "tgt", receptions: "rec", passInt: "int", interceptions: "int" };
  function statVal(r, k) {
    if (k === "pra") return r.pts + r.reb + r.ast;
    var v = r[k];
    return v == null && LOG_ALIAS[k] ? r[LOG_ALIAS[k]] : v;
  }
  function postedLine(p, k) { var ln = p && p.lines && p.lines[k]; return ln && ln.line != null ? ln.line : null; }
  /* a line the books quote on both sides: at least one book price over and under on that exact number */
  function twoSided(ln) { return !!(ln && ln.line != null && ln.over && ln.under && ln.over.n >= 1 && ln.under.n >= 1); }
  function twoSidedAny(p) { return !!(p && p.lines) && Object.keys(p.lines).some(function (k) { return twoSided(p.lines[k]); }); }

  /* ---------- the slate's context ---------- */
  /* the mean points allowed across the slate's NBA opponents (113 when the slate has none) */
  function leaguePA(players) {
    var seen = {}, vals = [];
    (players || []).forEach(function (p) { if (p.opp && p.opp.ptsAllowed && !seen[p.oppAbbr]) { seen[p.oppAbbr] = 1; vals.push(p.opp.ptsAllowed); } });
    return vals.length ? vals.reduce(function (a, b) { return a + b; }, 0) / vals.length : 113;
  }
  /* context(PROPS_DATA) or context(players): what the grade needs beyond one player */
  function context(data) {
    var players = Array.isArray(data) ? data : (data && data.players) || [], games = (!Array.isArray(data) && data && data.games) || [];
    var leagues = (!Array.isArray(data) && data && data.leagues) || {}, starts = {}, stats = {};
    games.forEach(function (g) { if (g && g.id != null) starts[g.id] = g.start; });
    Object.keys(leagues).forEach(function (lg) {
      var list = leagues[lg] && leagues[lg].stats;
      if (Array.isArray(list) && list.length) stats[lg] = list.map(function (s) { return s && s.key; }).filter(Boolean);
    });
    return { leaguePA: leaguePA(players), starts: starts, stats: stats };
  }
  function paOf(ctx) { return ctx && ctx.leaguePA ? ctx.leaguePA : 113; }
  /* when a player's game starts: his own commence, else the game's start */
  function startOf(p, ctx) { return (p && p.commence) || (ctx && ctx.starts && p ? ctx.starts[p.gameId] : null) || null; }
  /* still to start at `now` (ms). No start time, or no clock given, counts as open */
  function isOpen(p, now, ctx) {
    var t = Date.parse(startOf(p, ctx) || "");
    return now == null || !isFinite(t) || now < t;
  }
  /* the Eastern calendar day (YYYY-MM-DD) a player's game is played on; "" when it cannot be told */
  var ET_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
  var dayCache = {};
  function dayOf(p, ctx) {
    var s = startOf(p, ctx), t = Date.parse(s || "");
    if (!isFinite(t)) return "";
    return dayCache[s] || (dayCache[s] = ET_DAY.format(new Date(t)));
  }

  /* ---------- the maths: one side per player per stat ---------- */
  function hitsFor(p, statKey, line, side) {
    var vals = p.log.map(function (r) { return statVal(r, statKey); }).filter(function (v) { return v != null; });
    var over = function (arr) { return arr.filter(function (v) { return side === "under" ? v < line : v > line; }).length; };
    return { l5: [over(vals.slice(0, 5)), Math.min(5, vals.length)], l10: [over(vals.slice(0, 10)), Math.min(10, vals.length)], season: [over(vals), vals.length] };
  }
  function rate(pair) { return pair[1] ? pair[0] / pair[1] : 0; }
  /* ---- the grade: game data only, never other books' prices ----
     half the weighted hit rate against the number (last five games count more, shrunk toward even when the sample is short),
     half a projection from recent form and minutes, the opponent's defence, rest and the injury report, read against the
     player's own game-to-game spread. The posted line is only the number to clear. */
  var SD_FLOOR = { pts: 4, reb: 2, ast: 1.8, threes: 1, pra: 6 };
  function erf(x) { var s = x < 0 ? -1 : 1; x = Math.abs(x); var t = 1 / (1 + 0.3275911 * x); var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return s * y; }
  function Phi(z) { return 0.5 * (1 + erf(z / Math.SQRT2)); }
  function r1(n) { return Math.round(n * 10) / 10; }
  function ordinalText(n) { var s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  /* the NBA projection for one stat. Each reason carries the topic it speaks to (key), so a page can list a fact once */
  function project(p, k, ctx) {
    var s = p.stats && p.stats[k]; if (!s) return null;
    var parts = [], w = [], reasons = [];
    if (s.l5) { parts.push(s.l5); w.push(0.5); } if (s.l10) { parts.push(s.l10); w.push(0.3); } if (s.season) { parts.push(s.season); w.push(0.2); }
    var tw = w.reduce(function (a, b) { return a + b; }, 0), base = tw ? parts.reduce(function (a, v, i) { return a + v * w[i]; }, 0) / tw : 0;
    var m = p.minutes || {}, ratio = m.season ? Math.max(0.7, Math.min(1.3, m.l5 / m.season)) : 1;
    if (Math.abs(ratio - 1) >= 0.08) { base *= Math.pow(ratio, 0.5); reasons.push({ lean: ratio > 1 ? "over" : "under", key: "min", label: "Minutes " + (ratio > 1 ? "up" : "down") + ": " + m.l5 + " last 5 vs " + m.season + " season" }); }
    if (p.opp && p.opp.ptsAllowed) {
      var r = p.opp.ptsAllowed / paOf(ctx), pow = k === "pts" || k === "pra" ? 0.6 : k === "threes" ? 0.4 : 0.25; base *= Math.pow(r, pow);
      if (p.opp.rank <= 8) reasons.push({ lean: "over", key: "opp", label: p.oppAbbr + " allows " + p.opp.ptsAllowed + " a game, " + ordinalText(p.opp.rank) + " most" });
      else if (p.opp.rank >= 23) reasons.push({ lean: "under", key: "opp", label: p.oppAbbr + " allows only " + p.opp.ptsAllowed + ", " + ordinalText(31 - p.opp.rank) + " fewest" });
    }
    if (p.b2b) { base *= 0.96; reasons.push({ lean: "under", key: "rest", label: "Second night of a back-to-back" }); }
    else if (p.restDays >= 3 && p.restDays <= 10) { base *= 1.02; reasons.push({ lean: "over", key: "rest", label: p.restDays + " days' rest" }); }
    var split = p.home ? s.home : s.away, other = p.home ? s.away : s.home;
    if (split && other && p.gp >= 4) { base = 0.85 * base + 0.15 * split; var d = split / other - 1; if (Math.abs(d) >= 0.12) reasons.push({ lean: d > 0 ? "over" : "under", key: "split", label: (p.home ? "At home" : "On the road") + " averages " + split + " vs " + other }); }
    if (p.injury) { base *= 0.95; reasons.push({ lean: "under", key: "injury", label: "Injury report: " + p.injury }); }
    var floor = SD_FLOOR[k] != null ? SD_FLOOR[k] : 1; /* a stat with no floor of its own (one the page has never seen) takes 1 */
    var sd = Math.max(s.sd || 0, floor) * 1.25 * (p.injury ? 1.15 : 1); /* a quarter wider than the last ten suggest: tonight is one game */
    return { proj: r1(base), sd: sd, reasons: reasons };
  }
  var PHANTOM = 3; /* the hit rate is shrunk toward even by three phantom hits and three misses, so a 3-for-3 reads as 60%, not 100% */
  function weightedHit(p, k, line, side) {
    var vals = p.log.map(function (r) { return statVal(r, k); }).filter(function (v) { return v != null; }).slice(0, 10), num = PHANTOM, den = 2 * PHANTOM;
    vals.forEach(function (v, i) { var w = i < 5 ? 1 : 0.6; den += w; if (side === "under" ? v < line : v > line) num += w; });
    return { p: num / den, n: vals.length };
  }
  /* ---- the NFL: the pipeline's projection for the player's usage and the defence (scripts/nfl-props.js), read at any
     number: quantiles of past outcomes around the projection for yards, a Poisson count for touchdowns and catches ---- */
  var QS = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95];
  function cdfQ(q, x) {
    if (x < q[0]) return q[0] > 0 ? Math.max(0, QS[0] * x / q[0]) : 0;
    var n = q.length - 1;
    if (x >= q[n]) { var tau = Math.max(1, (q[n] - q[9]) / 3); return 1 - (1 - QS[n]) * Math.exp(-(x - q[n]) / tau); }
    var i = 0; for (var j = 0; j < q.length; j++) if (q[j] <= x) i = j;
    if (i >= n) return QS[n];
    return q[i + 1] > q[i] ? QS[i] + (QS[i + 1] - QS[i]) * (x - q[i]) / (q[i + 1] - q[i]) : QS[i + 1];
  }
  function poissonCdf(lambda, k) { if (k < 0) return 0; var term = Math.exp(-lambda), sum = term; for (var i = 1; i <= k; i++) { term *= lambda / i; sum += term; } return Math.min(1, sum); }
  function nflOver(pj, line) { return pj.dist === "poisson" ? 1 - poissonCdf(pj.mean, Math.floor(line + 1e-9)) : pj.q && pj.q.length ? 1 - cdfQ(pj.q, line) : 0.5; }
  /* the tiers. `tier` is the data's name (the lowest is "Lean"); `label` is what a page shows for it: "Low" (owner
     decision, 2026-11-08: the selections are leans, so a "Lean" badge read badly); the class stays */
  var GRADES = [[0.70, "High", "badge-conf-high", "High"], [0.62, "Medium", "badge-conf-medium", "Medium"], [0.56, "Low", "badge-conf-lean", "Lean"]];
  var MIN_GAMES = 4; /* the board wants at least this many logged games; a thinner sample is still graded and says so */
  function minGames(p) { return isNFL(p) ? 3 : MIN_GAMES; } /* NFL: three games, a month of football */
  function gradeOf(prob) { for (var i = 0; i < GRADES.length; i++) if (prob >= GRADES[i][0]) return { label: GRADES[i][1], cls: GRADES[i][2], tier: GRADES[i][3] }; return { label: "Coin flip", cls: "badge-flip", tier: "Coin flip" }; }
  /* one stat at one number: the side we favour, our probability, the grade and the reasons; prices only for shopping */
  function sideFor(p, k, line, ctx) {
    var ln = p.lines && p.lines[k];
    if (line == null || !p.log || !p.log.length) return null;
    var pr, pModelOver, st = (p.stats && p.stats[k]) || {};
    if (isNFL(p)) {
      var pj = p.proj && p.proj[k]; if (!pj) return null;
      pr = { proj: pj.mean, sd: null, reasons: (pj.reasons || []).map(function (x) { return { lean: x.lean, label: x.label }; }), why: pj.why };
      pModelOver = nflOver(pj, line);
    } else { pr = project(p, k, ctx); if (!pr) return null; pModelOver = 1 - Phi((line - pr.proj) / pr.sd); }
    var emp = weightedHit(p, k, line, "over");
    var pOver = 0.5 * pModelOver + 0.5 * emp.p;
    var side = pOver >= 0.5 ? "over" : "under", prob = side === "over" ? pOver : 1 - pOver;
    var h = hitsFor(p, k, line, side), g = gradeOf(prob);
    var projText = isNFL(p) ? "Projects " + pr.proj + (pr.why || st.season != null ? " (" + (pr.why || "") + (pr.why && st.season != null ? "; " : "") + (st.season != null ? "season " + st.season : "") + ")" : "")
      : "Projects " + pr.proj + " (last 5: " + st.l5 + ", last 10: " + st.l10 + ", season: " + st.season + ")";
    var reasons = [{ lean: side, key: "hit", label: (side === "over" ? "Cleared " : "Stayed under ") + line + " in " + h.l10[0] + " of the last " + h.l10[1] }, { lean: pr.proj > line ? "over" : "under", key: "proj", label: projText }].concat(pr.reasons);
    if (p.log.length < minGames(p)) reasons.push({ lean: "neutral", key: "sample", label: "Small sample: " + p.log.length + " game" + (p.log.length === 1 ? "" : "s") + " logged, so the grade is pulled toward even" });
    var trend = (p.signals || []).filter(function (x) { return isNFL(p) ? x.key === k || x.key === "usage" || x.key === "split" || x.key === "rest" : x.key === k || (k === "pra" && (x.key === "pts" || x.key === "reb" || x.key === "ast")) || x.key === "steady"; }).map(function (x) { return { lean: x.lean, key: x.key, label: x.label }; });
    reasons = reasons.concat(trend);
    var mine = reasons.filter(function (x) { return x.lean === side; }), theirs = reasons.filter(function (x) { return x.lean !== side && x.lean !== "neutral"; }), neutral = reasons.filter(function (x) { return x.lean === "neutral"; });
    var px = ln && ln.line === line ? (side === "over" ? ln.over : ln.under) : null, other = ln && ln.line === line ? (side === "over" ? ln.under : ln.over) : null;
    return { p: p, k: k, line: line, side: side, prob: prob, pOver: pOver, grade: g, proj: pr.proj, sd: pr.sd, hit: h, l10: rate(h.l10), emp: emp.p, reasons: mine, against: theirs, neutral: neutral,
      odds: px && px.odds != null ? px.odds : null, book: px ? px.book : null, n: px ? px.n : 0, otherOdds: other && other.odds != null ? other.odds : null, otherBook: other ? other.book : null, posted: !!(ln && ln.line === line) };
  }
  /* every stat of a player that has a posted line, each graded at that line */
  function allSides(p, ctx) { return keysOf(p, ctx).map(function (k) { return sideFor(p, k, postedLine(p, k), ctx); }).filter(Boolean); }
  /* the site's order: game day first, then our probability, then the raw hit rate, then the longer sample */
  function dayCmp(a, b, ctx) { var x = dayOf(a, ctx) || "~", y = dayOf(b, ctx) || "~"; return x < y ? -1 : x > y ? 1 : 0; }
  function better(a, b, ctx) { return dayCmp(a.p, b.p, ctx) || (b.prob - a.prob) || (b.l10 - a.l10) || (b.hit.l10[1] - a.hit.l10[1]); }
  /* the board: only stats with a line the books quote both ways, enough games behind the player, and a game still to start */
  function boardable(p, k, now, ctx) { return twoSided(p.lines && p.lines[k]) && p.log.length >= minGames(p) && isOpen(p, now, ctx); }
  /* a player's top side on the board. opts: { now, ctx, stat } (stat narrows it to one key) */
  function bestSide(p, opts) {
    opts = opts || {};
    var ctx = opts.ctx, mine = keysOf(p, ctx), keys = opts.stat ? [opts.stat] : mine;
    var s = keys.filter(function (k) { return mine.indexOf(k) !== -1 && boardable(p, k, opts.now, ctx); }).map(function (k) { return sideFor(p, k, postedLine(p, k), ctx); }).filter(Boolean);
    return s.length ? s.sort(function (a, b) { return better(a, b, ctx); })[0] : null;
  }

  return {
    leagueOf: leagueOf, isNFL: isNFL, keysOf: keysOf, NBA_KEYS: NBA_KEYS, statVal: statVal, postedLine: postedLine, twoSided: twoSided, twoSidedAny: twoSidedAny,
    leaguePA: leaguePA, context: context, startOf: startOf, isOpen: isOpen, dayOf: dayOf,
    hitsFor: hitsFor, rate: rate, project: project, weightedHit: weightedHit, cdfQ: cdfQ, poissonCdf: poissonCdf, nflOver: nflOver,
    gradeOf: gradeOf, minGames: minGames, sideFor: sideFor, allSides: allSides, better: better, boardable: boardable, bestSide: bestSide,
    ordinalText: ordinalText, GRADES: GRADES, MIN_GAMES: MIN_GAMES, PHANTOM: PHANTOM, SD_FLOOR: SD_FLOOR, QS: QS
  };
});
