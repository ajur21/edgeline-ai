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
          --slot <name> the daily run this is (morning | afternoon | manual, the default): sports with `slots` are fetched
                        only on theirs, and a morning run gives way when the month's credits run short (see SPORTS)
          --track       no Odds API calls: grade finished games from the free sources (ESPN, SportsGameOdds), refresh
                        DraftKings numbers (ESPN, free) on the board, rebuild breakdowns, rewrite picks.js (and
                        performance.js when anything was graded)
   ========================================================================== */
"use strict";
const fs = require("fs");
const path = require("path");
const context = require("./context.js");
const sgo = require("./sgo.js");
const model = require("./model.js");
const availability = require("./availability.js");
const nfl = require("./nfl.js"); /* NFL model (2026-11-08): nflverse data, read once a run when an NFL game is modelled */
const SLOT_TIMES = require("./slot-due.js").SLOTS; /* the daily runs' UTC times: morning [14, 0], afternoon [20, 30] */

const API = "https://api.the-odds-api.com/v4";
let VERBOSE = false;
/* Which sports a full run fetches (2026-11-05; the owner: "we still need to do nfl and mlb and mls"), cheapest first:
   - The Odds API marks a sport out of season inactive on /sports (free), and a request that returns no events costs
     nothing (its docs: "If no events are returned, the request will not count against the usage quota"); the odds
     request asks only for games starting inside the pick window (commenceTimeFrom/To), so a sport with no game in the
     window costs nothing either. A request with events costs markets x regions (ten named bookmakers = one region):
     3 a sport, 2 for soccer.
   - ESPN's scoreboard (free) is read first for every Eastern day the window touches; a sport with no game starting
     inside it is not asked at all (this covers NFL Thursdays, Saturdays and holidays, and the off-season).
   - days: the fallback when ESPN cannot be read (Eastern weekdays, 0 = Sunday; omitted = every day).
   - slots: the daily runs that fetch the sport (the workflow passes --slot morning|afternoon; a manual run fetches every
     sport). The weekly sports go on the afternoon run only: with the 36-hour window it still sees the next day's
     games (Friday's covers Saturday's soccer, Saturday's covers Sunday's NFL), and two runs a day for every sport is
     more than the free tier's 500 credits a month (see the request budget in CLAUDE.md). The NBA too since 2026-11-08:
     replayed on the league's official injury report, the afternoon read beat the morning one held out and the morning
     price had already moved most of the way to the close; RULES.availabilityHold keeps a game for its own game day. */
const SPORTS = [
  /* morningDays (2026-11-08, owner: NFL "the same focus as NBA and NHL"): on these Eastern weekdays the morning run also
     fetches the NFL, but only when one of its games kicks off before that day's afternoon run (ESPN's `early` count):
     every Sunday (the 1 PM and London slates, priced Saturday afternoon until now), Thanksgiving's early games, a late-
     season Saturday game that kicks off before 3:30 PM ET; never TNF, SNF or MNF, which the afternoon runs price. ESPN
     unreadable: Sundays only. About 3 credits an NFL Sunday. */
  { key: "americanfootball_nfl", sport: "NFL", league: "NFL", markets: ["h2h", "spreads", "totals"], spreadLabel: "Spread", days: [3, 4, 6, 0, 1], slots: ["afternoon"], morningDays: [0, 4, 6] },
  /* NBA on the afternoon run only since 2026-11-08 (the official injury report: availability.js, CLAUDE.md "NBA availability") */
  { key: "basketball_nba", sport: "NBA", league: "NBA", markets: ["h2h", "spreads", "totals"], spreadLabel: "Spread", slots: ["afternoon"] },
  { key: "baseball_mlb", sport: "MLB", league: "MLB", markets: ["h2h", "spreads", "totals"], spreadLabel: "Run line" },
  { key: "icehockey_nhl", sport: "NHL", league: "NHL", markets: ["h2h", "spreads", "totals"], spreadLabel: "Puck line" },
  { key: "soccer_epl", sport: "Soccer", league: "Premier League", markets: ["h2h", "totals"], goals: true, days: [5, 6, 0], slots: ["afternoon"] },
  { key: "soccer_usa_mls", sport: "Soccer", league: "MLS", markets: ["h2h", "totals"], goals: true, days: [2, 3, 5, 6, 0], slots: ["afternoon"] }
  /* La Liga (soccer_spain_la_liga) is off to stay inside the free request tier; add it back here when the budget allows. */
];
/* College football (scripts/ncaaf.js, 2026-11-08): Friday's afternoon run only (runDays, see runDayAllows). Its 36-hour
   window holds Friday night and all of Saturday, where nearly every FBS game is; 3 credits a week instead of 18 for
   every afternoon with a game (the MAC's Tuesday and Wednesday nights, Thursday) keeps the month inside the free tier
   (see the request budget in CLAUDE.md). Shown as "College football" by the pages. */
SPORTS.push({ key: "americanfootball_ncaaf", sport: "NCAAF", league: "NCAAF", markets: ["h2h", "spreads", "totals"], spreadLabel: "Spread", days: [5], slots: ["afternoon"], runDays: [5] });
/* Pinnacle anchors the fair line; the rest are the books a pick can name. Ten bookmakers cost the same as one region. */
const ANCHOR = "pinnacle";
const BOOKS = [ANCHOR, "draftkings", "fanduel", "betmgm", "williamhill_us", "betrivers", "fanatics", "espnbet", "bovada", "betonlineag"];
const RULES = {
  minBooks: 3,          // the line needs at least this many books (anchor included) to be analysed
  /* The bar (Phase 2, 2026-11-05; the owner: one sport "favored", picks that "pop and go"; approved "fewer, steadier
     picks"): our probability must beat what the best price implies by the model's own error on that side (model.noise:
     the sample behind both teams, at this side's line), barZ of them, and never by less than minEdge. Early in a
     season that is about 9-12 points on an NBA side and 6-7 on an NHL one; it falls toward 3 as the games pile up. One
     flat 3-point bar let the noisiest sport fill the board. */
  minEdge: 0.03,        // the floor of every bar
  barZ: 1,              // the bar is this many of the model's own errors on the side
  medium: 0.02, high: 0.05, // points past the bar for Medium and High (Lean is anything past it)
  maxPerDay: 10, maxPerSportDay: 5, // per Eastern game day, counting what earlier runs posted that day; one pick per game
  watchShare: 0.5,      // the market board's "watch": at least this share of the side's bar (and watchEdge)
  onePerGame: true,     // false = the pre-2026-11-05 rule, one pick per market (kept for the offline test's fixture checks)
  horizonHours: 36,     // only events starting within this window
  gradeAfterHours: 3,   // a completed flag grades at once; a score source without one is trusted, and The Odds API's scores asked (full runs), only this long after the start
  cardHours: 18,        // a started pick stays on picks.js this long after its start, with its status and grade
  voidAfterDays: 7,     // give up on ungraded events after this long
  windowDays: 30,       // performance window
  minRequestsLeft: 25,  // stop fetching odds when the API quota runs this low
  afternoonReserve: 10, // a morning run keeps this many credits back for every afternoon run left before the quota resets on the 1st (the afternoon run costs about 9 with NBA, NHL, NFL and soccer)
  sgoReserve: 150,      // leave this many SportsGameOdds entities untouched each month (free tier: 2,500)
  sgoTrackWindowHours: 8, // in --track runs, spend SportsGameOdds entities only on games starting within this many hours
  watchEdge: 0.015,     // a point and a half over the price: shown on the market board as "watch", never a pick
  officialReport: true, // read the NBA's official injury report (scripts/availability.js); false = ESPN's injury report alone
  /* NBA: per slot, which games post nothing yet (availability.unresolvedOf): "report" holds a game until both clubs are on
     the official report (its own game day: the afternoon run would otherwise pick tomorrow's games on the day before's
     news), "open" also holds a costed player still questionable (for a morning run, should the NBA return to it) */
  availabilityHold: { morning: "open", afternoon: "report", manual: "report" },
  availabilityFlag: 0.5, // a posted NBA pick is flagged when a player's status moves its game's margin by this many points or more
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
function num(n, d) { return n == null || !Number.isFinite(Number(n)) ? null : round(n, d); }
function edgeNum(c) { return c.edge == null ? -1 : c.edge; } /* a side with no model sorts last and never clears a bar */
/* the worst price that still makes the pick: the American number whose implied probability is our probability minus
   the pick's own bar (RULES.minEdge for a pick logged before bars), as a whole number on the side that still clears it
   (-118.4 -> -118, +134.2 -> +135). Prices are only the number to beat; this says how far the price can drift before
   the bet stops being one. Null when that probability is not strictly between 0 and 1. */
function valueTo(modelProb, bar) {
  if (modelProb == null || modelProb === "") return null;
  const p = Number(modelProb) - (Number(bar) > 0 ? Number(bar) : RULES.minEdge);
  if (!Number.isFinite(p) || p <= 0 || p >= 1) return null;
  const exact = p >= 0.5 ? -100 * p / (1 - p) : 100 * (1 - p) / p;
  const whole = Math.ceil(exact - 1e-9); /* the epsilon keeps an exact whole price (p = 0.6 -> -150) from rounding past it */
  return whole === -100 ? 100 : whole; /* even money is written +100 */
}

/* ---------- time (everything user-facing is Eastern) ---------- */
const ET = "America/New_York";
function etWeekday(d) { return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(new Intl.DateTimeFormat("en-US", { timeZone: ET, weekday: "short" }).format(d)); }
function etDate(d) { return new Intl.DateTimeFormat("en-CA", { timeZone: ET, year: "numeric", month: "2-digit", day: "2-digit" }).format(d); }
/* "Today 7:00 PM ET", "Tomorrow …", a weekday for a later day, and "Yesterday …" for a started pick still on the card
   (the pages read a bare weekday as a later day) */
function startLabel(d, now) {
  const day = etDate(d), today = etDate(now), tomorrow = etDate(new Date(now.getTime() + 864e5)), yesterday = etDate(new Date(now.getTime() - 864e5));
  const time = new Intl.DateTimeFormat("en-US", { timeZone: ET, hour: "numeric", minute: "2-digit" }).format(d) + " ET";
  const dow = new Intl.DateTimeFormat("en-US", { timeZone: ET, weekday: "short" }).format(d);
  return (day === today ? "Today" : day === tomorrow ? "Tomorrow" : day === yesterday ? "Yesterday" : dow) + " " + time;
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
    return { outcome: { name: o.name, point: o.point == null ? null : o.point }, odds: bestPrice, book: bestBook, prices: prices, fair: fair[i], edge: fair[i] - implied(bestPrice), marketFair: fair[i], marketEdge: fair[i] - implied(bestPrice), books: group.length, anchor: anchorName, anchorNote: !anchorBook && shifted ? shifted.note : null, anchorShift: !anchorBook && shifted ? shifted.shift : 0, market: market };
  }).filter(Boolean).sort((a, b) => b.edge - a.edge);
}
/* The owner's rule (2026-11-04): a side's probability comes from the game model (scripts/model.js: this season's results
   and margins, form, rest, injuries, home edge), never from another book's price. This re-prices every candidate: `fair`
   and `edge` become the model's probability and its gap over the best price; the books' de-vigged number survives only
   as `marketFair` / `marketEdge`, for the closing line and the breakdown's "where the market sits" reference. A game
   the model cannot build (no ESPN record for it) has no probability on any side and can never be a pick. */
function priceWithModel(gm, ev, priced) {
  priced.forEach(function (c) {
    const p = gm ? model.sideProb(gm, c.market, c.outcome, ev.home_team, ev.away_team) : null;
    c.fair = p; c.edge = p == null ? null : p - implied(c.odds);
    c.model = gm && p != null ? Object.assign(model.publicModel(gm), { reasons: model.sideReasons(gm, c.market, c.outcome, ev.home_team, ev.away_team) }) : null;
    /* the side's own bar: the model's error on it (see RULES.barZ), never under the floor; `past` is how far the edge clears it */
    c.noise = gm && p != null ? model.noise(gm, c.market, c.outcome, ev.home_team, ev.away_team) : null;
    c.bar = p == null ? null : barOf(c.noise);
    c.past = p == null ? null : c.edge - c.bar;
  });
  return priced.sort((a, b) => edgeNum(b) - edgeNum(a));
}
function barOf(noise) { return Math.max(RULES.minEdge, noise && Number.isFinite(noise.p) ? RULES.barZ * noise.p : 0); }
function barParts(c) { return c.noise ? { error: c.noise.p, units: c.noise.units, unit: c.noise.unit, gp: c.noise.gp, floor: RULES.minEdge } : null; }
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
/* the pick an event offers: one at most (Phase 2: a moneyline and a spread on the same team are one bet, and two
   picks on a game crowded the board), the main-line side furthest past its own bar, across every market */
function analyzeEvent(cfg, ev, priced) {
  const all = priced || priceOutcomes(cfg, ev);
  if (VERBOSE) cfg.markets.forEach(function (market) {
    const top = all.filter(c => c.market === market && c.qualifies && c.edge != null).sort((a, b) => b.past - a.past)[0];
    if (top) console.log("  " + eventName(cfg, ev) + " | " + market + " | " + top.books + " books" + (top.anchor ? (top.anchorShift ? " (anchored, carried " + top.anchorShift + ")" : " (anchored)") : " (consensus)") + " | best " + top.outcome.name + " " + (top.outcome.point == null ? "" : top.outcome.point) + " at " + fmtOdds(top.odds) + " (" + top.book + "): edge " + (top.edge * 100).toFixed(2) + " pts, bar " + (top.bar * 100).toFixed(1) + ", past " + (top.past * 100).toFixed(2));
  });
  const past = all.filter(c => c.qualifies && c.edge != null && c.past >= 0 && model.hasSignal(cfg.key, c.market)).sort((a, b) => (b.past - a.past) || (b.edge - a.edge));
  if (!RULES.onePerGame) return cfg.markets.map(m => past.find(c => c.market === m)).filter(Boolean);
  return past.length ? [past[0]] : [];
}

/* the tier is how far the edge clears the side's own bar; a thin sample (under four games behind either team) never
   rates above Lean */
function confidence(past, thin) { const t = past >= RULES.high ? "High" : past >= RULES.medium ? "Medium" : "Lean"; return thin ? "Lean" : t; }
function rationale(c, cfg) {
  const line = c.outcome.point == null ? "" : " at " + (c.market === "spreads" && c.outcome.point > 0 ? "+" : "") + c.outcome.point;
  if (c.fair == null) return "No game model for this game yet (no record of either team's season), so no probability and no pick. " + c.book + " offers " + fmtOdds(c.odds) + ".";
  const m = c.model || {};
  return "Our probability" + line + " is " + pct(c.fair) + ", from the game data: this season's results and margins, recent form, rest, the injury report and home edge" + (m.margin != null && c.market !== "totals" ? " (projected margin " + (m.margin > 0 ? "+" : "") + m.margin + " for the home side" : m.total != null ? " (projected total " + m.total : "") + (m.margin != null || m.total != null ? ")" : "") + ". " + c.book + " offers " + fmtOdds(c.odds) + ", which implies only " + pct(implied(c.odds)) + ". " + barSentence(c) + " Not graded against other books' prices" + (c.marketFair != null ? "; for reference the market makes it " + pct(c.marketFair) : "") + ".";
}
/* "Its bar is 9.2 points: the model's own margin of error here, with 8 games behind each team (±4.8 points on the margin). It clears it by 3.1." */
function barSentence(c) {
  if (c.bar == null) return "";
  const n = c.noise, floor = !n || c.bar <= RULES.minEdge + 1e-9;
  const pts1 = x => (x * 100).toFixed(1);
  return "Its bar is " + pts1(c.bar) + " points" + (floor ? " (the floor: the model's own margin of error here is smaller)" : ": the model's own margin of error on this side, with " + n.gp + " game" + (n.gp === 1 ? "" : "s") + " behind the thinner team (±" + n.units + " " + n.unit + " on the " + (c.market === "totals" ? "total" : "margin") + ")") + ". It clears it by " + pts1(c.past) + ".";
}
function factors(c) {
  if (c.fair == null) return ["Best price " + fmtOdds(c.odds) + " at " + c.book, "No game model for this game"];
  return ["Best price " + fmtOdds(c.odds) + " at " + c.book, "Probability " + pct(c.fair) + " from game data, not other books", "Edge " + (c.edge * 100).toFixed(1) + " points over the price, " + (c.past * 100).toFixed(1) + " past its bar of " + (c.bar * 100).toFixed(1), c.marketFair != null ? "Market reference " + pct(c.marketFair) : null].filter(Boolean);
}
function slug(s) { return String(s).replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, ""); }

/* ---------- closing line value ---------- */
/* The close is always a pre-game price (fixed 2026-11-08). Until then the first source was SportsGameOdds' event record
   read after the game, whose odds are by then the last in-game state with no book open: 16 of the first 17 graded picks
   read "consensus close (SportsGameOdds, 0 books)" (the Flyers ML posted at +133 "closed" at +1010, the Kraken ML at
   +110 at +1281, an Under 3.5 at -914), so CLV read 20 to 40 points either way. Best source first now:
   (a) ESPN's core odds record for the game, its explicit `close` block (DraftKings: context.closingOdds);
   (b) the newest SportsGameOdds point we recorded ourselves before the start (`sgoHistory` with `at` before `commence`;
       the hourly track runs add one whenever the price moves within RULES.sgoTrackWindowHours of the start): the
       consensus fair across the books on our exact line, else the vendor's fair when its line is ours, else only the
       direction the line moved;
   (c) the newest Odds API check before the start (`history`, two checks or more: the first is the posting price itself);
   else null. SportsGameOdds' post-game record still gives a score (sgo.result), never a price.
   CLV = the close's fair probability − the probability implied by the price we logged, only when the close is on our line
   (always for a moneyline); otherwise `clv` is null and `lineMove` says whether the line moved toward or away from us. */
function preGame(points, commence) {
  const t = Date.parse(commence || "");
  return (points || []).filter(x => x && Number.isFinite(Date.parse(x.at || "")) && (!Number.isFinite(t) || Date.parse(x.at) < t));
}
const hasNum = v => v != null && v !== "" && Number.isFinite(Number(v));
function closingLine(entry) {
  const h = preGame(entry.history, entry.commence).filter(x => hasNum(x.fair));
  if (h.length < 2) return null;
  const last = h[h.length - 1];
  return { at: last.at, odds: last.odds, fair: round(Number(last.fair), 4), samples: h.length };
}
function clvOf(entry) {
  const c = closingLine(entry);
  return c ? round(c.fair - implied(entry.odds), 4) : null;
}
/* (b): our own last SportsGameOdds look before the start */
function sgoPreClose(entry) {
  const pts = preGame(entry.sgoHistory, entry.commence); if (!pts.length) return null;
  const last = pts[pts.length - 1], point = entry.outcome && entry.outcome.point != null ? Number(entry.outcome.point) : null;
  const vendorOnOurs = entry.marketKey === "h2h" || (hasNum(last.line) && point != null && Math.abs(Number(last.line) - point) < 1e-9);
  let fair = null, line = entry.marketKey === "h2h" ? null : point, odds = hasNum(last.best) ? Number(last.best) : hasNum(last.odds) ? Number(last.odds) : null;
  if (hasNum(last.fair)) fair = Number(last.fair); /* the books on our exact line, de-vigged */
  else if (vendorOnOurs && hasNum(last.vendorFair)) { fair = Number(last.vendorFair); if (hasNum(last.odds)) odds = Number(last.odds); }
  else if (!vendorOnOurs) { line = hasNum(last.line) ? Number(last.line) : null; odds = hasNum(last.odds) ? Number(last.odds) : odds; }
  const moved = fair == null ? context.movedToward(entry, { line: point, odds: entry.odds }, { line: line, odds: odds }) : null;
  return { source: "last pre-game check (SportsGameOdds, " + (last.n || 0) + " books)", at: last.at, line: line, odds: odds, fair: fair == null ? null : round(fair, 4), moved: moved, samples: pts.length };
}
/* the close, (a) -> (b) -> (c); deps.ctx is the context source (ESPN) */
async function closeFor(entry, deps) {
  let c = null;
  if (deps && deps.ctx) { try { c = await context.closingOdds(deps.ctx, entry); } catch (err) { c = null; } }
  if (!c) c = sgoPreClose(entry);
  const own = closingLine(entry);
  if (!c && own) c = Object.assign({ source: "last check (Odds API)" }, own);
  if (c && c.samples == null) c.samples = own ? own.samples : 1;
  if (c) delete c.score;
  return c;
}
/* write a close and what follows from it; nothing else on the entry moves (result, units and grade stay as graded) */
function applyClose(entry, c) {
  entry.close = c || null;
  entry.clv = c && typeof c.fair === "number" ? round(c.fair - implied(entry.odds), 4) : null;
  entry.lineMove = c && c.fair == null && c.moved ? c.moved : null;
}
/* Self-heal (2026-11-08): a graded pick whose close was read from SportsGameOdds' post-game record ("consensus close
   (SportsGameOdds, N books)": every one of them was read after the game), or whose close is a check taken after the start,
   gets its close, CLV and line move re-derived by closeFor on the next run. A repair that finds no pre-game price leaves
   the close null and tries again on the next two runs (`closeRepair.tries`), in case ESPN was down. */
const REPAIR_TRIES = 3;
function closeNeedsRepair(e) {
  if (e.type || e.status !== "graded") return false;
  if (!e.close) return !!(e.closeRepair && e.closeRepair.tries < REPAIR_TRIES);
  if (/^consensus close \(SportsGameOdds/.test(e.close.source || "")) return true;
  const at = Date.parse(e.close.at || ""), t = Date.parse(e.commence || "");
  return Number.isFinite(at) && Number.isFinite(t) && at >= t;
}
async function repairCloses(log, now, deps) {
  let repaired = 0;
  for (const e of log) {
    if (!closeNeedsRepair(e)) continue;
    const was = e.close ? { source: e.close.source || null, odds: e.close.odds != null ? e.close.odds : null, line: e.close.line != null ? e.close.line : null, clv: e.clv != null ? e.clv : null } : (e.closeRepair && e.closeRepair.was) || null;
    const c = await closeFor(e, deps);
    applyClose(e, c);
    e.closeRepair = { at: now.toISOString(), was: was, tries: c ? 0 : ((e.closeRepair && e.closeRepair.tries) || 0) + 1 };
    if (c) delete e.closeRepair.tries;
    repaired++;
  }
  return repaired;
}

/* ---------- grading ---------- */
/* the market a log entry is graded on. The pipeline logs the label in `market` ("Moneyline", "Puck line", "Total") and
   the key in `marketKey`; grading on the label sent every moneyline and spread down the totals branch. */
const MARKET_KEYS = { Moneyline: "h2h", Spread: "spreads", "Run line": "spreads", "Puck line": "spreads", Total: "totals" };
function marketKeyOf(e) { const k = e.marketKey || e.market; return MARKET_KEYS[k] || k; }
function grade(entry, scoreEv) {
  if (!scoreEv || !scoreEv.completed || !Array.isArray(scoreEv.scores)) return null;
  const sc = {}; scoreEv.scores.forEach(s => { sc[s.name] = Number(s.score); });
  const home = sc[scoreEv.home_team], away = sc[scoreEv.away_team];
  if (!Number.isFinite(home) || !Number.isFinite(away)) return null;
  const o = entry.outcome || {}, market = marketKeyOf(entry); let result;
  if (market === "h2h") {
    const winner = home > away ? scoreEv.home_team : away > home ? scoreEv.away_team : "Draw";
    result = o.name === winner ? "Win" : (winner === "Draw" && o.name !== "Draw" && !entry.threeWay) ? "Push" : "Loss";
  } else if (market === "spreads") {
    if (o.point == null) return null;
    const mine = o.name === scoreEv.home_team ? home : away, theirs = o.name === scoreEv.home_team ? away : home;
    const diff = mine + Number(o.point) - theirs;
    result = diff > 0 ? "Win" : diff < 0 ? "Loss" : "Push";
  } else if (market === "totals") {
    if (o.point == null) return null;
    const total = home + away, line = Number(o.point);
    result = total === line ? "Push" : (o.name === "Over") === (total > line) ? "Win" : "Loss";
  } else return null; /* a market we cannot read is never guessed at */
  const units = result === "Win" ? round(profitPerUnit(entry.odds), 2) : result === "Loss" ? -1 : 0;
  return { result, units, score: away + "-" + home, final: { home: home, away: away } };
}
/* has a score source's game finished? Its completed flag settles that at once; a source with no flag at all is trusted
   only once the game started RULES.gradeAfterHours ago */
function isFinal(flag, commence, now) {
  if (flag === true) return true;
  if (flag === false) return false;
  return Date.parse(commence) < now.getTime() - RULES.gradeAfterHours * 36e5;
}
/* one SportsGameOdds lookup per game per run: the picks on one game (its moneyline, spread and total) share the result
   and the close, so a game costs one entity however many picks it carries */
function onceEach(src) {
  if (!src || !src.enabled) return src;
  const memo = {};
  return Object.assign({}, src, { events: function (p) { const k = JSON.stringify(p); return memo[k] || (memo[k] = src.events(p)); } });
}
/* a graded pick's final score, home and away, as the grading source reported it */
function finalOf(e) {
  if (e.finalScore && Number.isFinite(Number(e.finalScore.home)) && Number.isFinite(Number(e.finalScore.away))) return { home: Number(e.finalScore.home), away: Number(e.finalScore.away) };
  const m = /^(\d+)-(\d+)$/.exec(String(e.score == null ? "" : e.score)); /* the log's display form is "away-home" */
  return m ? { home: Number(m[2]), away: Number(m[1]) } : null;
}

/* Every pending single whose game has started is looked at, in full runs and hourly track runs alike. Scores come from
   the free sources first: ESPN's scoreboard for the game's Eastern date, then SportsGameOdds' results. A completed flag
   grades the game at once; RULES.gradeAfterHours is the floor only for a source without one. A game ESPN reports as
   still on is left for the next run rather than spending a SportsGameOdds entity on it: inside the floor always, and
   in track runs (`deps.track`) past it too, so a postponed game does not cost an entity an hour until it is voided;
   the full runs still ask SportsGameOdds past the floor, as before. The Odds API scores endpoint (`deps.scores`, full
   runs only: it costs credits) is called once per sport, and only when a pick past the floor is still unsettled; track
   runs pass no `scores`, so they never call it and never void anything. The close and CLV are written at grading, best
   source first. Returns how many picks were graded and how many score calls it made. */
async function gradeStarted(log, now, deps) {
  deps = Object.assign({}, deps, { sgoSrc: onceEach(deps.sgoSrc) });
  const t = now.getTime(), floor = t - RULES.gradeAfterHours * 36e5;
  const bySport = {};
  log.filter(e => !e.type && e.status === "pending" && Date.parse(e.commence) <= t).forEach(e => { (bySport[e.sportKey] = bySport[e.sportKey] || []).push(e); });
  let graded = 0, scoresRequests = 0;
  const fromScores = (e, home, away) => ({ completed: true, home_team: e.home, away_team: e.away, scores: [{ name: e.home, score: home }, { name: e.away, score: away }] });
  async function settle(e, scoreEv) {
    const g = grade(e, scoreEv); if (!g) return false;
    e.status = "graded"; e.result = g.result; e.units = g.units; e.score = g.score; e.finalScore = g.final; e.gradedAt = now.toISOString();
    /* the close, always pre-game (see closeFor): DraftKings' close (ESPN), our last SportsGameOdds look before the start,
       our last Odds API check before the start */
    applyClose(e, await closeFor(e, deps));
    graded++;
    return true;
  }
  for (const sportKey of Object.keys(bySport)) {
    const left = [];
    for (const e of bySport[sportKey]) {
      const past = Date.parse(e.commence) < floor;
      let scoreEv = null, live = false;
      try {
        const sb = await deps.ctx.scoreboard(e.sportKey, etDate(new Date(Date.parse(e.commence))).replace(/-/g, ""));
        const m = context.findEvent(sb, e.home, e.away);
        if (m) {
          const type = m.comp.status && m.comp.status.type, flag = type && typeof type.completed === "boolean" ? type.completed : undefined;
          /* soccer settles on the score after 90 minutes: a playoff tie's extra time is taken back out (null: unreadable, wait) */
          const sc = /^soccer_/.test(e.sportKey || "") ? context.regulationScore(m) : { home: m.home.score, away: m.away.score };
          if (isFinal(flag, e.commence, now) && sc && sc.home != null && sc.away != null) scoreEv = fromScores(e, sc.home, sc.away);
          else live = flag === false;
        }
      } catch (err) { scoreEv = null; }
      /* SportsGameOdds' record of a finished game: its score only (never its prices: see closeFor) */
      if (!scoreEv && (!live || (past && !deps.track)) && deps.sgoOk()) {
        let res = null; try { res = await sgo.result(deps.sgoSrc, e); } catch (err) { res = null; }
        if (res && res.score) scoreEv = fromScores(e, res.score.home, res.score.away);
      }
      if (!scoreEv || !(await settle(e, scoreEv))) left.push(e);
    }
    if (!deps.scores || !left.some(e => Date.parse(e.commence) < floor)) continue;
    const scores = await deps.scores(sportKey); scoresRequests++;
    const byId = {}; (scores || []).forEach(s => { byId[s.id] = s; });
    for (const e of left) {
      const s = byId[e.eventId];
      if (s && isFinal(typeof s.completed === "boolean" ? s.completed : undefined, e.commence, now) && await settle(e, Object.assign({}, s, { completed: true }))) continue;
      if (Date.parse(e.commence) < t - RULES.voidAfterDays * 864e5) e.status = "void";
    }
  }
  return { graded: graded, scoresRequests: scoresRequests };
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
/* a parlay settles once every leg has: any loss loses it, pushes drop out, the rest must all win. Returns how many settled. */
function gradeParlays(log, now) {
  const byId = {}; log.forEach(e => { byId[e.id] = e; });
  let settled = 0;
  log.filter(e => e.type === "parlay" && e.status === "pending").forEach(function (p) {
    const legs = p.legs.map(id => byId[id]);
    if (legs.some(l => !l || l.status === "void")) { p.status = "void"; settled++; return; }
    if (!legs.every(l => l.status === "graded")) return;
    const wins = [], losses = [];
    legs.forEach(function (l, i) { if (l.result === "Loss") losses.push(l); else if (l.result === "Win") wins.push(p.legPrices[i]); });
    p.status = "graded"; p.gradedAt = now.toISOString(); settled++;
    if (losses.length) { p.result = "Loss"; p.units = -1; }
    else if (!wins.length) { p.result = "Push"; p.units = 0; }
    else { p.result = "Win"; p.units = round(wins.reduce((d, pr) => d * decimal(pr), 1) - 1, 2); }
  });
  return settled;
}
function record(entries) {
  const r = { wins: 0, losses: 0, pushes: 0, units: 0, n: entries.length };
  entries.forEach(e => { r[e.result === "Win" ? "wins" : e.result === "Loss" ? "losses" : "pushes"]++; r.units = round(r.units + e.units, 2); });
  return r;
}
/* which grade a pick was made on: "game" (the game model, owner rule 2026-11-04) or "price" (the earlier price edge
   against the sharp line). The two records are kept apart so the old grade never flatters or drags the new one. */
function basisOf(e) { return e.basis === "game" ? "game" : "price"; }

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
  /* the record by grade: game-data picks apart from the earlier price-edge picks, each with its ROI and first date */
  const byBasis = {};
  ["game", "price"].forEach(function (b) {
    const all = singles.filter(e => basisOf(e) === b), g = graded.filter(e => basisOf(e) === b), r = record(g);
    byBasis[b] = Object.assign(r, { roi: g.length ? round(r.units / g.length * 100, 1) : 0, pending: all.filter(e => e.status === "pending").length, since: all.map(e => e.date).filter(Boolean).sort()[0] || null });
  });
  const recentBasis = recent.map(function (r) { const e = graded.find(x => x.pick === r.pick && x.date === r.date && x.event === r.event); return Object.assign(r, { basis: e ? basisOf(e) : "price" }); });
  return { sample: false, source: "The Odds API", asOf: etDate(now), windowDays: RULES.windowDays, record: rec, units: units, roi: risked ? round(units / risked * 100, 1) : 0, avgEdge: avgEdge, graded: risked, daily: daily, bySport: bySport, recent: recentBasis, byDate: byDate, potd: potd, parlays: parlays, clv: clv, byBasis: byBasis };
}

/* ---------- which sports a run fetches (see SPORTS) ---------- */
function oddsCost(cfg) { return cfg.markets.length; } /* markets x regions; ten named bookmakers count as one region */
/* a sport with `slots` is fetched only on those daily runs; a manual run (or none named) fetches every sport */
function slotAllows(cfg, slot, weekday) { return !cfg.slots || !slot || slot === "manual" || cfg.slots.indexOf(slot) !== -1 || (slot === "morning" && !!cfg.morningDays && cfg.morningDays.indexOf(weekday) !== -1); }
/* a sport with `runDays` (Eastern weekdays, 0 = Sunday; NCAAF: Friday) is fetched only on runs on those days; a manual run
   fetches it whatever the day */
function runDayAllows(cfg, slot, weekday) { return !cfg.runDays || !slot || slot === "manual" || weekday == null || cfg.runDays.indexOf(weekday) !== -1; }
function runDayWhy(cfg) { return "fetched on " + cfg.runDays.map(d => ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d]).join(" and ") + " runs only"; }
/* ESPN's scoreboard (free) for every Eastern day the pick window touches: how many games start inside the window, and
   whether any day could not be read (null, or no events list). Postponed and cancelled games do not count. */
async function espnGames(src, cfg, now) {
  const t0 = now.getTime(), horizon = t0 + RULES.horizonHours * 36e5, days = [];
  for (let t = t0; t < horizon + 864e5; t += 864e5) { const d = etDate(new Date(Math.min(t, horizon))).replace(/-/g, ""); if (days.indexOf(d) === -1) days.push(d); }
  let games = 0, failed = 0, early = 0;
  /* early: games kicking off before today's afternoon run (SLOT_TIMES.afternoon, UTC), the ones only a morning run can price */
  const aft = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), SLOT_TIMES.afternoon[0], SLOT_TIMES.afternoon[1]);
  for (const d of days) {
    let sb = null;
    try { sb = await src.scoreboard(cfg.key, d); } catch (err) { sb = null; }
    if (!sb || !Array.isArray(sb.events)) { failed++; continue; }
    sb.events.forEach(function (e) {
      const t = Date.parse(e.date), c = e.competitions && e.competitions[0], type = (c && c.status && c.status.type) || (e.status && e.status.type) || {};
      if (t > t0 && t < horizon && !/POSTPONED|CANCELED|CANCELLED|SUSPENDED/i.test(type.name || "")) { games++; if (t < aft) early++; }
    });
  }
  return { games: games, failed: failed, days: days, early: early };
}
/* the afternoon runs (20:30 UTC, scripts/slot-due.js) still to come before The Odds API resets its credits, on the 1st
   of every month (its FAQ), counting today's if it has not run yet */
function afternoonsLeft(now) {
  const hm = SLOT_TIMES.afternoon, y = now.getUTCFullYear(), m = now.getUTCMonth(), end = Date.UTC(y, m + 1, 1);
  let n = 0;
  for (let d = Date.UTC(y, m, now.getUTCDate()); d < end; d += 864e5) if (d + (hm[0] * 60 + hm[1]) * 6e4 > now.getTime()) n++;
  return n;
}
/* fetch this sport's odds this run? { fetch, why }. o: { slot, espn: espnGames(), weekday (Eastern, 0 = Sunday), fixture,
   remaining (credits left, from the last response), afternoonsLeft }.
   1. the slot rule (slotAllows); 2. ESPN: a game inside the window fetches, none skips, and only when a day could not be
   read and no game was found does the sport's `days` rule decide (ignored on fixtures); 3. the morning guard: a morning run
   spends only what the month can spare after RULES.afternoonReserve credits for every afternoon run left before the
   reset, so when credits run short the morning runs give way first and the afternoon runs (closer to the evening games)
   last to the 1st. */
function fetchDecision(cfg, o) {
  if (!slotAllows(cfg, o.slot, o.weekday)) return { fetch: false, why: "fetched on the " + cfg.slots.join(" and ") + " run only" };
  if (!runDayAllows(cfg, o.slot, o.weekday)) return { fetch: false, why: runDayWhy(cfg) }; /* college football: Friday runs only */
  const e = o.espn;
  let why;
  /* a sport on the morning run only by its morningDays: a game must kick off before the afternoon run (2026-11-08) */
  if (o.slot === "morning" && cfg.slots && cfg.slots.indexOf("morning") === -1) {
    if (e && !e.failed && !(e.early > 0)) return { fetch: false, why: "no game before the afternoon run on ESPN" };
    if ((!e || e.failed) && !(e && e.early > 0) && o.weekday !== 0) return { fetch: false, why: "ESPN unreadable; mornings only on Sundays" };
  }
  if (e && e.games > 0) why = e.games + " game" + (e.games === 1 ? "" : "s") + " inside " + RULES.horizonHours + " hours on ESPN";
  else if (e && !e.failed) return { fetch: false, why: "no game inside " + RULES.horizonHours + " hours on ESPN" };
  else if (!o.fixture && cfg.days && cfg.days.indexOf(o.weekday) === -1) return { fetch: false, why: "ESPN unreadable; not one of its days" };
  else why = "ESPN unreadable; " + (cfg.days ? "one of its days" : "every day");
  if (o.slot === "morning" && o.remaining != null && o.afternoonsLeft != null) {
    const keep = RULES.minRequestsLeft + o.afternoonsLeft * RULES.afternoonReserve;
    if (o.remaining - oddsCost(cfg) < keep) return { fetch: false, why: "morning run gives way: " + o.remaining + " credits left, " + keep + " kept for the " + o.afternoonsLeft + " afternoon runs to the reset" };
  }
  return { fetch: true, why: why };
}
/* the last market file's rows for the sports this run did not fetch, games still ahead only, each with `pricedAt` (when
   its prices were read) and its pick / watch flag re-read from the log now (a pick no longer pending is a plain row) */
function carriedRows(dataDir, plan, now, log) {
  const skipped = new Set((plan || []).filter(p => !p.fetch).map(p => p.sport));
  if (!skipped.size) return [];
  let prev = null;
  try { const vm = require("vm"), sb = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(dataDir, "market.js"), "utf8"), sb); prev = sb.window.MARKET_DATA; } catch (e) { prev = null; }
  if (!prev || prev.sample || !Array.isArray(prev.rows)) return [];
  const pending = new Set(log.filter(e => !e.type && e.status === "pending").map(e => e.id));
  return prev.rows.filter(r => skipped.has(r.sportKey) && Date.parse(r.commence) > now.getTime()).map(function (r) {
    const c = Object.assign({}, r, { pricedAt: r.pricedAt || prev.generatedAt });
    c.pickId = r.pickId && pending.has(r.pickId) ? r.pickId : null;
    c.status = c.pickId ? "pick" : isWatch(c) ? "watch" : "none";
    return c;
  });
}
/* The Odds API wants whole seconds: 2026-11-05T17:00:00Z */
function apiTime(ms) { return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z"); }
function oddsParams(cfg, now) {
  const p = { bookmakers: BOOKS.join(","), markets: cfg.markets.join(","), oddsFormat: "american" };
  if (now) { p.commenceTimeFrom = apiTime(now.getTime()); p.commenceTimeTo = apiTime(now.getTime() + RULES.horizonHours * 36e5); }
  return p;
}

/* ---------- API ---------- */
async function apiGet(pathname, params, key, usage) {
  const url = new URL(API + pathname);
  Object.keys(params).forEach(k => url.searchParams.set(k, params[k]));
  url.searchParams.set("apiKey", key);
  const res = await fetch(url);
  /* x-requests-remaining / -used: the month's credits; x-requests-last: what this call cost (0 for an empty answer) */
  const left = Number(res.headers.get("x-requests-remaining")), used = Number(res.headers.get("x-requests-used")), last = res.headers.get("x-requests-last");
  if (Number.isFinite(left)) usage.remaining = left;
  if (Number.isFinite(used)) usage.used = used;
  usage.last = last != null && Number.isFinite(Number(last)) ? Number(last) : null;
  if (!res.ok) throw new Error("Odds API " + res.status + " for " + pathname + ": " + (await res.text()).slice(0, 200));
  return res.json();
}

/* ---------- main ---------- */
async function run(opts) {
  const now = opts.now ? new Date(opts.now) : new Date();
  const dataDir = opts.out || path.join(__dirname, "..", "data");
  const logPath = path.join(dataDir, "picks-log.json");
  const log = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath, "utf8")) : [];
  const usage = { remaining: null, used: null, last: null };
  if (opts.track) return trackRun(opts, now, dataDir, logPath, log);
  const source = opts.fixture ? fixtureSource(opts.oddsFixture) : liveSource(opts.key, usage);
  const ctxSource = context.source({ fixture: opts.fixture, officialReport: opts.officialReportFixture });
  const sgoSrc = sgo.source({ fixture: opts.fixture });
  const sgoBudget = sgoSrc.enabled ? await sgoSrc.usage() : null;
  const sgoOk = () => sgoSrc.enabled && (!sgoBudget || sgoBudget.max - sgoBudget.used - sgoSrc.stats().entities > RULES.sgoReserve);

  /* 1. grade every pending pick whose game has finished (see gradeStarted: free sources first; The Odds API scores
     endpoint only for picks past the floor that neither could settle), then the parlays */
  const g = await gradeStarted(log, now, { ctx: ctxSource, sgoSrc: sgoSrc, sgoOk: sgoOk, scores: sportKey => source.scores(sportKey) });
  const scoresRequests = g.scoresRequests;
  gradeParlays(log, now);
  /* closes read after the game before 2026-11-08 get a pre-game one (performance.js is rewritten below, as every full run does) */
  const closesRepaired = await repairCloses(log, now, { ctx: ctxSource });
  if (closesRepaired) console.log("Closes repaired: " + closesRepaired + " graded picks had a close read after the game; re-derived from pre-game prices");

  /* 2. fetch odds and find today's edges */
  const active = await source.activeSports();
  const fresh = [], candidates = []; /* candidates: each game's best side past its bar, every sport, chosen in selectPicks */
  /* the game model's per-run caches (scoreboards, schedules, injuries, shared with the context step through ctxSource) and
     NBA scoring by name, so an injured scorer costs what he scores */
  const modelCache = { ppgOf: model.ppgFromFaces(facesPath(opts, dataDir)), officialReport: RULES.officialReport,
    /* NFL model (2026-11-08): nflverse's files, cached in data/nflverse.json and downloaded at most once a week */
    nfl: nfl.lazy({ file: path.join(dataDir, "nflverse.json"), now: now, fetcher: opts.fixture ? nfl.fixtureFetcher(path.join(__dirname, "fixtures", "nflverse")) : null, log: m => console.log(m) }) };
  let modelled = 0, unmodelled = 0; const waited = []; /* NBA games held until their availability is in (RULES.availabilityHold) */
  const marketRows = []; /* every main-line market priced this run, pick or not: the market board */
  const plan = []; /* per sport: fetched or not, why, and what it cost (x-requests-last) */
  for (const cfg of SPORTS) {
    if (active && !active.has(cfg.key)) { plan.push({ sport: cfg.key, fetch: false, why: "out of season (The Odds API lists it inactive)" }); continue; }
    if (usage.remaining != null && usage.remaining < RULES.minRequestsLeft) { console.warn("Odds API quota low (" + usage.remaining + " left); skipping " + cfg.key); plan.push({ sport: cfg.key, fetch: false, why: "quota low" }); continue; }
    /* the slot rule first (no ESPN call for a sport this run never fetches), then ESPN's schedule, then the morning guard */
    if (!slotAllows(cfg, opts.slot, etWeekday(now))) { plan.push({ sport: cfg.key, fetch: false, why: "fetched on the " + cfg.slots.join(" and ") + " run only" }); continue; }
    if (!runDayAllows(cfg, opts.slot, etWeekday(now))) { plan.push({ sport: cfg.key, fetch: false, why: runDayWhy(cfg) }); continue; } /* college football: Friday runs only */
    const espn = await espnGames(ctxSource, cfg, now);
    const d = fetchDecision(cfg, { slot: opts.slot, espn: espn, weekday: etWeekday(now), fixture: opts.fixture, remaining: usage.remaining, afternoonsLeft: afternoonsLeft(now) });
    if (!d.fetch) { plan.push({ sport: cfg.key, fetch: false, why: d.why }); continue; }
    const events = await source.odds(cfg, now);
    plan.push({ sport: cfg.key, fetch: true, why: d.why, cost: usage.last, events: (events || []).length });
    const horizon = now.getTime() + RULES.horizonHours * 36e5;
    if (VERBOSE) console.log(cfg.key + ": " + (events || []).length + " events, " + (events || []).filter(ev => { const t = Date.parse(ev.commence_time); return t > now.getTime() && t < horizon; }).length + " within " + RULES.horizonHours + "h");
    for (const ev of events || []) {
      const t = Date.parse(ev.commence_time);
      if (!(t > now.getTime() && t < horizon)) continue;
      /* the game model first (ESPN: both teams' seasons, rest, injuries); without one no side gets a probability */
      let gm = null;
      try { gm = await model.forEvent(ctxSource, context, { sportKey: cfg.key, home: ev.home_team, away: ev.away_team, commence: ev.commence_time }, now, modelCache); } catch (err) { if (VERBOSE) console.warn("  model failed for " + eventName(cfg, ev) + ": " + err.message); }
      if (gm) modelled++; else unmodelled++;
      if (VERBOSE && gm) { const pm = model.publicModel(gm); console.log("  " + eventName(cfg, ev) + " | model: margin " + (pm.margin > 0 ? "+" : "") + pm.margin + " (home), total " + pm.total + (gm.thin ? ", thin sample" : "")); }
      const priced = priceWithModel(gm, ev, priceOutcomes(cfg, ev));
      /* NBA (2026-11-08): a game whose availability is still open at this slot's level (RULES.availabilityHold: a club
         not on the official report yet; on a morning run also a costed player questionable) posts nothing this run */
      const open = gm && gm.availability ? availability.unresolvedOf(gm.availability, RULES.availabilityFlag, RULES.availabilityHold[opts.slot]) : [];
      if (open.length) waited.push(eventName(cfg, ev) + " (" + open.slice(0, 2).join(", ") + ")");
      priced.filter(c => c.qualifies).forEach(function (c) {
        marketRows.push({ key: candidateKey(ev.id, c), eventId: ev.id, sport: cfg.sport, league: cfg.league, sportKey: cfg.key, event: eventName(cfg, ev), home: ev.home_team, away: ev.away_team, commence: ev.commence_time, start: startLabel(new Date(t), now),
          marketKey: c.market, market: marketLabel(cfg, c.market), outcome: c.outcome, pick: pickName(cfg, c.market, c.outcome), odds: c.odds, book: c.book, prices: c.prices, books: c.books, anchor: c.anchor, anchorShift: c.anchorShift || 0,
          modelProb: num(c.fair, 4), edge: num(c.edge, 4), ev: c.fair == null ? null : round(c.fair * (1 + profitPerUnit(c.odds)) - 1, 4), marketFair: num(c.marketFair, 4), marketEdge: num(c.marketEdge, 4),
          modelled: !!gm, model: c.model ? { margin: c.model.margin, total: c.model.total, gp: c.model.gp, thin: c.model.thin } : null, bar: num(c.bar, 4), past: num(c.past, 4), waiting: open.length ? open : null });
      });
      /* picks already on the board: track the price (and the market's fair, for the close) until tip-off, edge or no
         edge. A posted pick is locked (owner, 2026-11-05): it is never withdrawn and is graded at the posted price;
         `current` (our probability, edge and bar now) is how the page says whether the edge still holds. */
      priced.forEach(function (c) {
        const seen = log.find(e => e.key === candidateKey(ev.id, c) && e.status === "pending");
        if (!seen) return;
        seen.current = { at: now.toISOString(), odds: c.odds, book: c.book, fair: num(c.marketFair, 4), edge: num(c.edge, 4), modelProb: num(c.fair, 4), bar: num(c.bar, 4) };
        seen.history = (seen.history || []).concat([{ at: now.toISOString(), odds: c.odds, fair: num(c.marketFair, 4) }]).slice(-12);
        /* who plays: the model's fresh read against what the pick knew when it was posted (the pick stays locked) */
        if (gm && gm.availability && seen.availability && seen.availability.posted) seen.availability = availabilityUpdate(seen, gm.availability, now, null);
      });
      (open.length ? [] : analyzeEvent(cfg, ev, priced)).forEach(function (c) {
        const key = candidateKey(ev.id, c);
        if (log.some(e => e.key === key)) return; /* logged once, at the price first seen */
        candidates.push({
          key: key, id: slug(ev.id.slice(0, 10) + "-" + c.market + "-" + c.outcome.name), date: etDate(new Date(t)), commence: ev.commence_time,
          sport: cfg.sport, league: cfg.league, sportKey: cfg.key, eventId: ev.id, home: ev.home_team, away: ev.away_team,
          event: eventName(cfg, ev), market: marketLabel(cfg, c.market), marketKey: c.market, outcome: c.outcome, threeWay: !!cfg.goals && c.market === "h2h",
          pick: pickName(cfg, c.market, c.outcome), odds: c.odds, book: c.book, prices: c.prices, books: c.books, anchor: c.anchor, anchorNote: c.anchorNote || null, anchorShift: c.anchorShift || 0,
          modelProb: round(c.fair, 4), edge: round(c.edge, 4), ev: round(c.fair * (1 + profitPerUnit(c.odds)) - 1, 4), confidence: confidence(c.past, !!(c.model && c.model.thin)),
          bar: round(c.bar, 4), past: round(c.past, 4), barParts: barParts(c),
          basis: "game", model: c.model, marketFair: num(c.marketFair, 4), marketEdge: num(c.marketEdge, 4),
          rationale: rationale(c, cfg), factors: factors(c), status: "pending", units: 0, loggedAt: now.toISOString(),
          /* NBA: who the model knew was out, doubtful, questionable or back, from which source and when (availability.js) */
          availability: gm && gm.availability ? { posted: gm.availability, changed: false, note: null, swing: null, changes: [], checkedAt: null } : null,
          current: { at: now.toISOString(), odds: c.odds, book: c.book, fair: num(c.marketFair, 4), edge: round(c.edge, 4), modelProb: round(c.fair, 4), bar: round(c.bar, 4) }, history: [{ at: now.toISOString(), odds: c.odds, fair: num(c.marketFair, 4) }]
        });
      });
    }
    if (VERBOSE) console.log("  requests remaining: " + usage.remaining);
  }
  selectPicks(log, candidates).forEach(p => fresh.push(p));

  /* 3. today's board = every pending pick whose event is still ahead; then the day's play and parlay. Everything chosen
     or refreshed below (context, prices, the play and parlay of the day) works on the board alone; picks.js also keeps
     the picks that started in the last RULES.cardHours (cardEntries), as they were left when they left the board. */
  const boardEntries = boardOf(log, now);
  const today = etDate(now);
  /* context (injuries, weather, rest, records) and the written breakdown for every pick on the board */
  let ctxRequests = 0;
  try { ctxRequests = await context.enrich(boardEntries, { fixture: opts.fixture, rules: RULES, now: now, source: ctxSource }); } catch (err) { console.warn("context step failed: " + err.message); }
  /* second price source: every book's price on each pick's line and the market's drift since the open, then the breakdowns again */
  let sgoStats = { changed: 0, entities: 0 };
  if (sgoOk() && boardEntries.length) { try { sgoStats = await sgo.refresh(boardEntries, { fixture: opts.fixture, now: now, source: sgoSrc }); boardEntries.forEach(e => { e.breakdown = context.buildBreakdown(e, e.context, RULES); }); } catch (err) { console.warn("SportsGameOdds step failed: " + err.message); } }
  const potdEntry = choosePlayOfDay(log, boardEntries, today);
  const parlayEntry = ensureParlayOfDay(log, boardEntries, today, now);
  const card = cardEntries(log, now).map(e => publicPick(e, now));
  const playOfDay = potdEntry ? publicPick(potdEntry, now) : null;
  const parlayOfDay = publicParlay(parlayEntry, log, now);

  /* the market board: every priced market, flagged pick / watch / none, best edge first */
  const pendingByKey = {}; log.filter(e => !e.type && e.status === "pending").forEach(e => { pendingByKey[e.key] = e.id; });
  marketRows.forEach(function (r) { r.pickId = pendingByKey[r.key] || null; r.status = r.pickId ? "pick" : isWatch(r) ? "watch" : "none"; delete r.key; });
  /* a sport this run did not fetch (its slot, the morning guard, the quota) keeps its rows from the last file for games
     still ahead, so Sunday's morning run never empties the NFL from the market board and the Games page an hour before
     kickoff. Each carried row says when it was priced (`pricedAt`) and is re-flagged against the log as it stands now. */
  carriedRows(dataDir, plan, now, log).forEach(r => marketRows.push(r));
  marketRows.sort((a, b) => edgeNum(b) - edgeNum(a));
  const marketData = { sample: false, source: "The Odds API", basis: "game", generatedAt: now.toISOString(), threshold: RULES.minEdge, watch: RULES.watchEdge,
    barRule: { floor: RULES.minEdge, z: RULES.barZ, watchShare: RULES.watchShare, medium: RULES.medium, high: RULES.high }, bars: barsBySport(marketRows),
    games: new Set(marketRows.map(r => r.eventId)).size, modelled: new Set(marketRows.filter(r => r.modelled).map(r => r.eventId)).size, sports: Array.from(new Set(marketRows.map(r => r.sport))), rows: marketRows };

  /* 4. write */
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(logPath, JSON.stringify(log, null, 1) + "\n");
  if (marketRows.length || !fs.existsSync(path.join(dataDir, "market.js"))) fs.writeFileSync(path.join(dataDir, "market.js"), "/* Generated by scripts/update-data.js. Do not edit; the next run overwrites it. */\nwindow.MARKET_DATA = " + JSON.stringify(marketData, null, 1) + ";\n");
  const picksData = { sample: false, source: "The Odds API", generatedAt: now.toISOString(), playOfDay: playOfDay, parlayOfDay: parlayOfDay, picks: card };
  writePicks(dataDir, picksData);
  const perf = summarize(log, now);
  writePerformance(dataDir, perf);
  return { added: fresh.length, closesRepaired: closesRepaired, waited: waited, board: boardEntries.length, card: card.length, settled: g.graded, graded: perf.graded, remaining: usage.remaining, used: usage.used, plan: plan, slot: opts.slot || "manual", playOfDay: playOfDay && playOfDay.pick, parlay: parlayOfDay && parlayOfDay.legs.length, contextRequests: ctxRequests, modelled: modelled, unmodelled: unmodelled, scoresRequests: scoresRequests, market: marketRows.length, marketGames: marketData.games, sgo: { enabled: sgoSrc.enabled, entities: sgoSrc.stats().entities, moved: sgoStats.changed, monthUsed: sgoBudget ? sgoBudget.used : null } };
}
const GENERATED = "/* Generated by scripts/update-data.js. Do not edit; the next run overwrites it. */\n";
function writePicks(dataDir, data) { fs.writeFileSync(path.join(dataDir, "picks.js"), GENERATED + "window.PICKS_DATA = " + JSON.stringify(data, null, 2) + ";\n"); }
function writePerformance(dataDir, perf) { fs.writeFileSync(path.join(dataDir, "performance.js"), GENERATED + "window.PERF_DATA = " + JSON.stringify(perf, null, 2) + ";\n"); }

/* ---------- choosing the run's picks (Phase 2, 2026-11-05: fewer, steadier picks, every sport on one scale) ----------
   Every game's best side past its own bar, from every sport, furthest past first; a game that already has a pick
   (from this run or an earlier one, any status but void) gets no second one; at most RULES.maxPerDay picks per Eastern
   game day and RULES.maxPerSportDay per sport that day, counting what earlier runs posted. Each chosen pick is
   appended to the log and returned.
   The day's cap ranks across sports and runs by points past the bar (2026-11-08): only the day's picks at least as far
   past their own bars as the candidate count against it, so picks an earlier run posted for a sport priced first (NBA,
   NHL and soccer on the morning run; the NFL comes on the afternoon run) never crowd out a later one that clears its bar
   by more. On 2026-11-07 NHL 5 + soccer 5 filled the day before any NFL game was priced; on 2026-11-08 eight picks were
   posted before the NFL. Within a run nothing changes (candidates come furthest past first); a posted pick stays posted
   (locked), so a day can end above the cap, never with a weaker pick admitted; a pick from before bars counts as
   ahead of everything. The bar is never lowered. */
function selectPicks(log, candidates) {
  const posted = log.filter(e => !e.type && e.status !== "void");
  const onGame = new Set(posted.map(e => e.eventId)), dayPast = {}, sportDay = {};
  const pastOf = e => Number.isFinite(e.past) ? e.past : Infinity;
  posted.forEach(e => { (dayPast[e.date] = dayPast[e.date] || []).push(pastOf(e)); sportDay[e.date + "|" + e.sport] = (sportDay[e.date + "|" + e.sport] || 0) + 1; });
  const out = [];
  candidates.slice().sort((a, b) => (b.past - a.past) || (b.edge - a.edge)).forEach(function (c) {
    const sd = c.date + "|" + c.sport, ahead = (dayPast[c.date] || []).filter(p => p >= pastOf(c)).length;
    if ((RULES.onePerGame && onGame.has(c.eventId)) || ahead >= RULES.maxPerDay || (sportDay[sd] || 0) >= RULES.maxPerSportDay) return;
    onGame.add(c.eventId); (dayPast[c.date] = dayPast[c.date] || []).push(pastOf(c)); sportDay[sd] = (sportDay[sd] || 0) + 1;
    log.push(c); out.push(c);
  });
  return out;
}
/* the market board's watch: a modelled side whose edge reaches half its own bar (and the old point and a half) */
function isWatch(r) { return r.edge != null && r.bar != null && r.edge >= Math.max(RULES.watchEdge, RULES.watchShare * r.bar) && model.hasSignal(r.sportKey, r.marketKey); }
/* each sport's bars across its modelled sides tonight, for the page's copy ("NBA sides need 9 to 12 points this early") */
function barsBySport(rows) {
  const by = {};
  rows.forEach(r => { if (r.bar != null) (by[r.sport] = by[r.sport] || []).push(r.bar); });
  const out = {};
  Object.keys(by).forEach(s => { const b = by[s].sort((x, y) => x - y); out[s] = { min: b[0], median: b[b.length >> 1], max: b[b.length - 1] }; });
  return out;
}
/* whether a posted pick's edge still holds at the last full run that re-priced it: "clears" its bar, "below" it but
   still positive, or "gone"; null until a later run has priced it. The pick stays either way (locked). */
function nowOf(e) {
  const c = e.current;
  if (!c || !c.at || c.at === e.loggedAt || c.edge == null) return null;
  return { at: c.at, odds: c.odds, book: c.book, modelProb: c.modelProb == null ? null : c.modelProb, edge: c.edge, bar: c.bar != null ? c.bar : e.bar != null ? e.bar : RULES.minEdge };
}
function standingOf(now) { return !now ? null : now.edge >= now.bar ? "clears" : now.edge >= 0 ? "below" : "gone"; }

/* ---------- what picks.js publishes ---------- */
/* the board: every pending single whose game is still ahead, best edge first. Only these are priced, refreshed and
   considered for the play and parlay of the day. */
function boardOf(log, now) { return log.filter(e => !e.type && e.status === "pending" && Date.parse(e.commence) > now.getTime()).sort((a, b) => b.edge - a.edge); }
/* the day's card (owner ask, 2026-11-05: picks were "popping and going" at tip-off): the board, then every single whose
   game started in the last RULES.cardHours whatever its status (pending while it plays, then graded or void), earliest
   start first, so a pick stays on the page through its game and shows its result */
function cardEntries(log, now) {
  const t = now.getTime(), since = t - RULES.cardHours * 36e5;
  const started = log.filter(e => !e.type && e.commence && Date.parse(e.commence) <= t && Date.parse(e.commence) > since)
    .sort((a, b) => (Date.parse(a.commence) - Date.parse(b.commence)) || ((b.edge || 0) - (a.edge || 0)));
  return boardOf(log, now).concat(started);
}
/* the pick as the site sees it. The last group is its state through the game: `status` is the log's own (pending,
   graded, void), `started` whether the game has begun, `result` "Win" | "Loss" | "Push" once graded, `units` the profit
   at one unit risked once graded, `score` the final { home, away } from the grading source, `loggedAt` when it was
   posted, and `valueTo` the worst price that still clears the bar on our probability. */
function publicPick(e, at) {
  const graded = e.status === "graded", now = nowOf(e);
  return { id: e.id, sport: e.sport, league: e.league, sportKey: e.sportKey, event: e.event, home: e.home, away: e.away, marketKey: e.marketKey, outcome: e.outcome, commence: e.commence, start: startLabel(new Date(e.commence), at), market: e.market, pick: e.pick, odds: e.odds, book: e.book, prices: e.prices || {}, pricesAt: e.pricesAt || e.loggedAt || null, books: e.books || null, anchor: e.anchor || null, modelProb: e.modelProb, ev: e.ev, confidence: e.confidence, basis: e.basis || "price", model: e.model || null, marketFair: e.marketFair == null ? null : e.marketFair, marketEdge: e.marketEdge == null ? null : e.marketEdge, rationale: e.rationale, factors: e.factors, breakdown: e.breakdown || null, context: e.context || null, movement: e.movement || null, dk: e.dk || null, dkHistory: e.dkHistory || [], mkt: e.mkt || null,
    sgo: e.sgo ? { at: e.sgo.at, n: e.sgo.n, best: e.sgo.best, fair: e.sgo.fair, vendorFair: e.sgo.vendor ? e.sgo.vendor.fair : null, open: e.sgo.open, now: e.sgo.now } : null, sgoHistory: e.sgoHistory || [],
    status: e.status || "pending", started: Date.parse(e.commence) <= at.getTime(), result: graded && e.result ? e.result : null, units: graded && typeof e.units === "number" ? e.units : null,
    score: graded ? finalOf(e) : null, loggedAt: e.loggedAt || null, valueTo: valueTo(e.modelProb, e.bar),
    bar: e.bar != null ? e.bar : null, past: e.past != null ? e.past : null, barParts: e.barParts || null, now: now, standing: standingOf(now), availability: publicAvailability(e.availability) };
}
/* ---------- who plays, after a pick is posted (NBA, 2026-11-08) ----------
   Every pick logs what the model knew about availability when it was posted (`availability.posted`: the official
   report's time and every listing with its status, source and cost). Each later run (full or hourly) reads it again and
   flags the pick when a player's status moved its game's margin by RULES.availabilityFlag points or more:
   availability: { changed, note ("Jokic ruled out at 5:30 PM ET (official report), after this lean was posted at
   9:04 AM ET; about 3.6 points of margin against this side on our numbers"), swing (points toward the pick; null for a
   total), changes, checkedAt }. The pick itself is locked: nothing here changes its price, probability or grade. */
function availabilityUpdate(entry, read, now, fullOf) {
  const a = entry.availability; if (!a || !a.posted) return a;
  const ch = availability.changesSince(a.posted, read, { min: RULES.availabilityFlag, fullOf: fullOf });
  if (ch == null) return a; /* this read cannot be compared (the report could not be read): keep the last flag */
  return Object.assign({ posted: a.posted }, availability.flagOf(entry, ch, a, now.toISOString()), { read: { at: read.read || now.toISOString(), report: read.report ? { label: read.report.label, at: read.report.at } : null } });
}
/* the hourly run's read: the official report (one PDF) and ESPN's NBA injury report (one request), merged per club as the
   model merges them; a player the posted snapshot did not carry is priced from data/faces.js (12% of his points, all
   his team's games). Returns how many board picks carry a change. */
async function trackAvailability(entries, now, ctxSource, opts, dataDir) {
  const nba = entries.filter(e => e.availability && e.availability.posted && model.OFFICIAL[e.sportKey]);
  if (!nba.length) return 0;
  let report = null, inj = null;
  try { report = await model.availabilityFor(ctxSource, { sportKey: "basketball_nba" }, now, { officialReport: RULES.officialReport }); } catch (err) { report = null; }
  try { inj = await ctxSource.injuries("basketball_nba"); } catch (err) { inj = null; }
  if (!inj) return nba.filter(e => e.availability.changed).length; /* ESPN unreadable: every ESPN listing would look cleared */
  const club = (name, reportTeam) => context.teamMatches(name, { displayName: reportTeam, name: String(reportTeam).split(" ").pop(), location: "" });
  const ppg = model.ppgFromFaces(facesPath(opts, dataDir)), cfg = model.SPORT.basketball_nba;
  const fullOf = i => { const p = ppg && i ? ppg(i) : null; return p != null ? cfg.out(i, p) : null; };
  nba.forEach(function (e) {
    const gameDate = etDate(new Date(Date.parse(e.commence)));
    const list = team => availability.mergeTeam(context.teamInjuries(inj, team), report, team, gameDate, club, null);
    const read = { read: now.toISOString(), report: report ? { source: report.source, label: report.label, at: report.at, url: report.url || null } : null, home: list(e.home), away: list(e.away) };
    e.availability = availabilityUpdate(e, read, now, fullOf);
  });
  return nba.filter(e => e.availability.changed).length;
}
function facesPath(opts, dataDir) { return opts.fixture ? path.join(__dirname, "fixtures", "sample-faces.js") : path.join(dataDir, "faces.js"); }
/* the flag as picks.js carries it, with who the pick was posted knowing about (listings that cost something then) */
function publicAvailability(a) {
  if (!a || !a.posted) return null;
  const knew = side => (a.posted[side] || []).filter(i => i.cost > 0 || (i.miss != null && i.miss >= model.MIN_MISS)).map(i => ({ side: side, name: i.name, status: i.status, source: i.source, at: i.at }));
  return { changed: !!a.changed, note: a.note || null, swing: a.swing != null ? a.swing : null, changes: a.changes || [], checkedAt: a.checkedAt || null,
    posted: { read: a.posted.read || null, report: a.posted.report || null, players: knew("home").concat(knew("away")) } };
}
/* the parlay of the day as the site sees it; `units` is its profit once graded */
function publicParlay(p, log, now) {
  if (!p) return null;
  const byId = {}; log.forEach(e => { byId[e.id] = e; });
  return { id: p.id, date: p.date, book: p.book, odds: p.odds, decimal: p.decimal, fairProb: p.fairProb, ev: p.ev, status: p.status, result: p.result || null, units: p.status === "graded" && typeof p.units === "number" ? p.units : null,
    legs: p.legs.map((id, i) => { const l = byId[id]; return { id: id, pick: l.pick, event: l.event, sport: l.sport, price: p.legPrices[i], started: Date.parse(l.commence) <= now.getTime(), result: l.result || null }; }) };
}

/* ---------- track mode: the hourly run between odds runs (no Odds API requests, ever) ----------
   1. grades every started game the free sources report finished (gradeStarted with no Odds API scores), then the
      parlays, and rewrites performance.js only when that settled something, so results land within the hour;
   2. refreshes DraftKings' numbers (ESPN) on the board and, close to tip-off, every book's price (SportsGameOdds);
   3. rebuilds the board's breakdowns and rewrites picks.js (the day's card), keeping generatedAt and adding trackedAt. */
async function trackRun(opts, now, dataDir, logPath, log) {
  const ctxSource = context.source({ fixture: opts.fixture, officialReport: opts.officialReportFixture });
  const sgoSrc = sgo.source({ fixture: opts.fixture });
  const boardEntries = boardOf(log, now);
  /* hourly runs spend SportsGameOdds entities only on games close to tip-off, when the numbers actually move, and on
     finished games (their result and close) */
  const soon = boardEntries.filter(e => Date.parse(e.commence) - now.getTime() <= RULES.sgoTrackWindowHours * 36e5);
  const started = log.some(e => !e.type && e.status === "pending" && Date.parse(e.commence) <= now.getTime());
  const sgoBudget = sgoSrc.enabled && (soon.length || started) ? await sgoSrc.usage() : null;
  const sgoOk = () => sgoSrc.enabled && (!sgoBudget || sgoBudget.max - sgoBudget.used - sgoSrc.stats().entities > RULES.sgoReserve);
  const g = await gradeStarted(log, now, { ctx: ctxSource, sgoSrc: sgoSrc, sgoOk: sgoOk, scores: null, track: true });
  const parlaysGraded = gradeParlays(log, now);
  const closesRepaired = await repairCloses(log, now, { ctx: ctxSource }); /* the same self-heal as a full run's */
  const t = await context.trackOdds(boardEntries, { fixture: opts.fixture, now: now, source: ctxSource });
  /* who plays: the NBA's official report and ESPN's, against what each posted NBA pick knew (flag only; picks stay locked) */
  let availabilityFlagged = 0;
  try { availabilityFlagged = await trackAvailability(boardEntries, now, ctxSource, opts, dataDir); } catch (err) { console.warn("availability check failed: " + err.message); }
  let sgoStats = { changed: 0, entities: 0 };
  if (soon.length && sgoOk()) { try { sgoStats = await sgo.refresh(soon, { fixture: opts.fixture, now: now, source: sgoSrc }); } catch (err) { console.warn("SportsGameOdds step failed: " + err.message); } }
  boardEntries.forEach(function (e) { e.breakdown = context.buildBreakdown(e, e.context, RULES); });
  const today = etDate(now);
  const potdEntry = log.find(e => !e.type && e.potd === today) || null;
  const parlayEntry = log.find(e => e.type === "parlay" && e.date === today) || null;
  /* keep the odds run's timestamp as generatedAt; trackedAt says when the book numbers were last refreshed */
  let generatedAt = now.toISOString();
  const picksPath = path.join(dataDir, "picks.js");
  if (fs.existsSync(picksPath)) { const m = fs.readFileSync(picksPath, "utf8").match(/"generatedAt":\s*"([^"]+)"/); if (m) generatedAt = m[1]; }
  const card = cardEntries(log, now).map(e => publicPick(e, now));
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(logPath, JSON.stringify(log, null, 1) + "\n");
  writePicks(dataDir, { sample: false, source: "The Odds API", generatedAt: generatedAt, trackedAt: now.toISOString(), playOfDay: potdEntry ? publicPick(potdEntry, now) : null, parlayOfDay: publicParlay(parlayEntry, log, now), picks: card });
  /* a run that graded nothing leaves performance.js as the last run wrote it */
  if (g.graded || parlaysGraded || closesRepaired) writePerformance(dataDir, summarize(log, now));
  return { track: true, closesRepaired: closesRepaired, board: boardEntries.length, card: card.length, graded: g.graded, parlaysGraded: parlaysGraded, scoresRequests: g.scoresRequests, moved: t.changed, sgoMoved: sgoStats.changed, sgoEntities: sgoSrc.stats().entities, contextRequests: t.requests, availabilityFlagged: availabilityFlagged };
}

function liveSource(key, usage) {
  if (!key) throw new Error("ODDS_API_KEY is not set");
  return {
    activeSports: async function () { const list = await apiGet("/sports", {}, key, usage); return new Set(list.filter(s => s.active).map(s => s.key)); },
    /* only the games inside the pick window: an answer with none costs nothing. Should the API ever refuse the window
       (a 4xx names it), ask once more without it, as before 2026-11-05 */
    odds: async function (cfg, now) {
      try { return await apiGet("/sports/" + cfg.key + "/odds", oddsParams(cfg, now), key, usage); }
      catch (err) { if (!now || !/ 4\d\d /.test(err.message) || !/commenceTime/i.test(err.message)) throw err; console.warn("Odds API refused the time window for " + cfg.key + "; asking without it"); return apiGet("/sports/" + cfg.key + "/odds", oddsParams(cfg, null), key, usage); }
    },
    scores: function (sportKey) { return apiGet("/sports/" + sportKey + "/scores", { daysFrom: 3 }, key, usage); }
  };
}
function fixtureSource(oddsFile) {
  const read = f => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", f), "utf8"));
  return {
    activeSports: async function () { return null; },
    odds: async function (cfg) { return read(oddsFile || "odds.json").filter(e => e.sport_key === cfg.key); },
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
    else if (argv[i] === "--slot") o.slot = argv[++i]; /* morning | afternoon | manual (the workflow passes it; see SPORTS) */
    else if (argv[i] === "--verbose") VERBOSE = true;
  }
  return o;
}
/* the run's Odds API spend, one line for the Actions log: "Odds API (afternoon run): NBA 3, NHL 3 | skipped: NFL (no game inside 36 hours on ESPN)" */
function planLine(r) {
  const name = k => (SPORTS.find(s => s.key === k) || {}).league || k;
  const got = (r.plan || []).filter(p => p.fetch).map(p => name(p.sport) + " " + (p.cost != null ? p.cost : "?") + " (" + p.events + " events)");
  const skipped = (r.plan || []).filter(p => !p.fetch).map(p => name(p.sport) + " (" + p.why + ")");
  return "Odds API (" + r.slot + " run): " + (got.length ? got.join(", ") : "nothing fetched") + (skipped.length ? " | skipped: " + skipped.join("; ") : "") + (r.remaining != null ? " | credits left " + r.remaining + (r.used != null ? ", used " + r.used : "") : "");
}

if (require.main === module) {
  run(parseArgs(process.argv.slice(2))).then(function (r) {
    if (r.track) { console.log("Track: " + r.board + " on the board, " + r.card + " on the card, graded " + r.graded + " (parlays " + r.parlaysGraded + ")" + (r.graded || r.parlaysGraded ? ", performance.js rewritten" : "") + ", DraftKings moved on " + r.moved + ", market moved on " + r.sgoMoved + " (" + r.sgoEntities + " SportsGameOdds entities), availability changed on " + r.availabilityFlagged + " NBA pick(s), ESPN requests: " + r.contextRequests); return; }
    console.log(planLine(r));
    if (r.waited && r.waited.length) console.log("NBA games held until who plays is in (the official report): " + r.waited.join("; "));
    console.log("Picks added: " + r.added + ", on the board: " + r.board + ", on the card: " + r.card + ", graded this run: " + r.settled + ", market board: " + r.market + " markets in " + r.marketGames + " games, graded in window: " + r.graded + ", play of the day: " + (r.playOfDay || "none") + ", parlay legs: " + (r.parlay || 0) + ", context requests: " + r.contextRequests + ", Odds API score calls: " + r.scoresRequests + (r.remaining != null ? ", API requests remaining: " + r.remaining : "") + (r.sgo.enabled ? ", SportsGameOdds entities this run: " + r.sgo.entities + (r.sgo.monthUsed != null ? " (month: " + r.sgo.monthUsed + ")" : "") : ", SportsGameOdds: no key"));
  }).catch(function (e) { console.error(e.message); process.exit(1); });
}
module.exports = { run, availabilityUpdate, publicAvailability, implied, devig, decimal, americanFromDecimal, analyzeEvent, selectPicks, barOf, nowOf, standingOf, isWatch, priceOutcomes, priceWithModel, confidence, shiftedAnchor, closingLine, clvOf, sgoPreClose, closeFor, applyClose, closeNeedsRepair, repairCloses, grade, isFinal, gradeStarted, summarize, profitPerUnit, bestParlay, choosePlayOfDay, gradeParlays, valueTo, boardOf, cardEntries, publicPick, RULES, SPORTS, LINE_VALUE, slotAllows, espnGames, afternoonsLeft, fetchDecision, oddsParams, oddsCost, planLine, carriedRows };
module.exports.runDayAllows = runDayAllows; /* college football: Friday runs only */
