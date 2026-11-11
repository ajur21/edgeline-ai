/* A sample NFL_WEEK_DATA for the hub's behaviour checks (scripts/nfl-hub-checks.js), in the shape scripts/nfl-week.js
   writes (CLAUDE.md, "NFL week hub"). It is flagged real (sample: false) because a sample file means no hub at all.
   The week is the sample fixtures' own: the NFL's week 9, with the suite's clock pinned to Wed 2026-11-04, 4:45 PM ET.
   Five of its games are the ones scripts/fixtures/browse-fixtures.js gives ESPN's schedule (same ESPN ids), two of
   those are on the sample board (Dallas at Philadelphia, g6; Kansas City at Buffalo, g5, with the sample lean p1), and
   two more exist only here: an indoor game and a game with no forecast. Thursday's game has a backup quarterback, the
   Monday game ran on the margin model (no quarterbacks), and nothing has been graded yet: the checks build the started
   games, the finals and the filled record from this file. The numbers are invented; the shape is the pipeline's. */
(function () {
  var at = "2026-11-04T19:02:11.000Z";
  function team(id, abbr, name, short, record) { return { id: String(id), abbr: abbr, name: name, short: short, record: record }; }
  function qb(name, o) { o = o || {}; return { id: o.id || "00-00" + name.length + "0000", name: name, epa: o.epa == null ? 0.05 : o.epa, ref: o.ref == null ? 0.03 : o.ref, points: o.points == null ? 0.6 : o.points, starts: o.starts == null ? 8 : o.starts, games: 8, kind: o.kind || "starter", replaces: o.replaces || null, replacesStatus: o.replacesStatus || null, lastStarter: o.lastStarter || null, status: o.status || null }; }
  function inj(points, list, more) { return { list: list.map(function (x) { return { name: x[0], pos: x[1], status: x[2], played: x[3] }; }), more: more || 0, points: points }; }
  function from(prob, bar, price) { return { prob: prob, bar: bar, price: price }; }
  /* a game still to start: the projection from the home side's probability, margin and total */
  function game(id, kickoff, away, home, o) {
    var p = null;
    if (o.probHome != null) {
      var winner = o.probHome >= 0.5 ? "home" : "away", r1 = function (n) { return Math.round(n * 10) / 10; };
      p = { model: o.model || "nflverse", at: at, locked: false, margin: o.margin, total: o.total, marginSd: o.sd || 4.1, home: r1((o.total + o.margin) / 2), away: r1((o.total - o.margin) / 2), winner: winner, prob: winner === "home" ? o.probHome : Math.round((1 - o.probHome) * 1e4) / 1e4, probHome: o.probHome, probAway: Math.round((1 - o.probHome) * 1e4) / 1e4,
        games: { home: 8, away: 8 }, thin: false, parts: o.parts || { home: 2.15, rating: 1.2, epa: 0.4, qb: 0.9, rest: 0, injuries: Math.round((o.margin - 4.65) * 100) / 100 }, ratings: { home: 1.4, away: 0.2 }, epa: o.model === "margin" ? null : { home: 0.03, away: -0.01 }, rest: o.model === "margin" ? null : { home: 7, away: 7 } };
    }
    return { id: String(id), week: 9, kickoff: kickoff, timeValid: true, state: "pre", status: "STATUS_SCHEDULED", detail: o.detail || "", score: null, home: home, away: away,
      venue: o.venue, neutral: false, tv: o.tv || "CBS", projection: p, qb: p ? o.qb || null : null, injuries: p ? o.injuries || { home: inj(0, []), away: inj(0, []) } : null, weather: p ? o.weather || null : null,
      leanFrom: p ? o.leanFrom : null, board: o.board || null, posted: o.posted || null, result: null };
  }
  var T = {
    JAX: team(30, "JAX", "Jacksonville Jaguars", "Jaguars", "5-3"), BAL: team(33, "BAL", "Baltimore Ravens", "Ravens", "4-4"), DAL: team(6, "DAL", "Dallas Cowboys", "Cowboys", "3-5"), PHI: team(21, "PHI", "Philadelphia Eagles", "Eagles", "6-2"),
    ATL: team(1, "ATL", "Atlanta Falcons", "Falcons", "4-4"), NO: team(18, "NO", "New Orleans Saints", "Saints", "3-5"), LV: team(13, "LV", "Las Vegas Raiders", "Raiders", "2-6"), DEN: team(7, "DEN", "Denver Broncos", "Broncos", "5-3"),
    SF: team(25, "SF", "San Francisco 49ers", "49ers", "6-2"), SEA: team(26, "SEA", "Seattle Seahawks", "Seahawks", "4-4"), KC: team(12, "KC", "Kansas City Chiefs", "Chiefs", "5-3"), BUF: team(2, "BUF", "Buffalo Bills", "Bills", "6-2"),
    CHI: team(3, "CHI", "Chicago Bears", "Bears", "4-4"), GB: team(9, "GB", "Green Bay Packers", "Packers", "5-3")
  };
  var NWS = "National Weather Service";
  var games = [
    /* Thursday: Baltimore starts its backup; an outdoor game with wind */
    game(401900001, "2026-11-06T01:15Z", T.JAX, T.BAL, { probHome: 0.642, margin: 5.3, total: 43.9, sd: 4.4, tv: "Prime Video", venue: { name: "M&T Bank Stadium", city: "Baltimore", state: "MD", country: "USA", indoor: false },
      parts: { home: 2.15, rating: 2.6, epa: 1.1, qb: -1.4, rest: 0, injuries: 0.85 },
      qb: { away: qb("Trevor Lawrence", { points: 0.2 }), home: qb("Tyler Huntley", { kind: "backup", replaces: "Lamar Jackson", replacesStatus: "Out", starts: 2, epa: -0.02, ref: 0.02, points: -1.2, status: "Questionable" }), points: -1.4 },
      injuries: { away: inj(1.9, [["Travis Hunter", "WR", "Injured Reserve", 6], ["Walker Little", "OT", "Doubtful", 8], ["Devin Lloyd", "LB", "Questionable", 8], ["Tyson Campbell", "CB", "Questionable", 7]], 2), home: inj(1.0, [["Kyle Hamilton", "S", "Out", 8], ["Nate Wiggins", "CB", "Questionable", 8]]) },
      weather: { mph: 12, dir: "NW", temp: 48, unit: "F", precip: 10, text: "Mostly Cloudy", at: "2026-11-05T20:00:00-05:00", source: NWS },
      leanFrom: { home: from(0.642, 0.101, -117), away: from(0.358, 0.101, 290) } }),
    /* Sunday, 1:00 PM: on the sample board (g6), so each side shows the best price now */
    game(401900002, "2026-11-08T18:00Z", T.DAL, T.PHI, { probHome: 0.588, margin: 3.1, total: 46.2, venue: { name: "Lincoln Financial Field", city: "Philadelphia", state: "PA", country: "USA", indoor: false },
      qb: { away: qb("Dak Prescott"), home: qb("Jalen Hurts", { points: 0.9 }), points: 0.3 },
      injuries: { away: inj(0.5, [["Trevon Diggs", "CB", "Out", 7]]), home: inj(0, []) },
      weather: { mph: 6, dir: "W", temp: 55, unit: "F", precip: 0, text: "Sunny", at: "2026-11-08T13:00:00-05:00", source: NWS },
      leanFrom: { home: from(0.588, 0.108, 109), away: from(0.412, 0.108, 229) },
      board: { eventId: "g6", pricedAt: "2026-11-04T21:30:00.000Z", home: { odds: -140, book: "DraftKings" }, away: { odds: 120, book: "FanDuel" } } }),
    /* Sunday, 1:00 PM: indoors, a quarterback change from last week */
    game(401900007, "2026-11-08T18:00Z", T.ATL, T.NO, { probHome: 0.531, margin: 1.1, total: 44.0, tv: "FOX", venue: { name: "Caesars Superdome", city: "New Orleans", state: "LA", country: "USA", indoor: true },
      qb: { away: qb("Michael Penix Jr."), home: qb("Spencer Rattler", { kind: "change", lastStarter: "Tyler Shough", starts: 3 }), points: 0.2 },
      leanFrom: { home: from(0.531, 0.112, 139), away: from(0.469, 0.112, 181) } }),
    /* Sunday, 4:05 PM: no forecast (the model had nothing to build it on) */
    game(401900006, "2026-11-08T21:05Z", T.LV, T.DEN, { tv: "CBS", venue: { name: "Empower Field at Mile High", city: "Denver", state: "CO", country: "USA", indoor: false } }),
    /* Sunday, 4:05 PM: the day's likeliest, an away side */
    game(401900003, "2026-11-08T21:05Z", T.SF, T.SEA, { probHome: 0.299, margin: -6.8, total: 45.1, tv: "FOX", venue: { name: "Lumen Field", city: "Seattle", state: "WA", country: "USA", indoor: false },
      qb: { away: qb("Brock Purdy", { points: 1.4 }), home: qb("Sam Darnold"), points: -0.8 },
      injuries: { away: inj(0, []), home: inj(2.4, [["DK Metcalf", "WR", "Out", 8], ["Charles Cross", "OT", "Doubtful", 7], ["Devon Witherspoon", "CB", "Questionable", 8], ["Leonard Williams", "DT", "Questionable", 8]], 3) },
      weather: { mph: 9, dir: "S", temp: 51, unit: "F", precip: 70, text: "Rain Likely", at: "2026-11-08T13:00:00-08:00", source: NWS },
      leanFrom: { home: from(0.299, 0.094, 388), away: from(0.701, 0.094, -154) } }),
    /* Sunday, 4:25 PM: on the sample board (g5) with a posted lean (the sample's p1) */
    game(401900004, "2026-11-08T21:25Z", T.KC, T.BUF, { probHome: 0.612, margin: 4.0, total: 48.6, venue: { name: "Highmark Stadium", city: "Orchard Park", state: "NY", country: "USA", indoor: false },
      qb: { away: qb("Patrick Mahomes", { status: "Questionable" }), home: qb("Josh Allen", { points: 1.1 }), points: 0.5 },
      injuries: { away: inj(0.3, [["Xavier Worthy", "WR", "Questionable", 8]]), home: inj(0.5, [["Dion Dawkins", "OT", "Out", 8]]) },
      weather: { mph: 15, dir: "W", temp: 41, unit: "F", precip: 20, text: "Mostly Cloudy", at: "2026-11-08T16:00:00-05:00", source: NWS },
      leanFrom: { home: from(0.612, 0.099, -105), away: from(0.388, 0.099, 247) },
      board: { eventId: "g5", pricedAt: "2026-11-04T21:30:00.000Z", home: { odds: -140, book: "DraftKings" }, away: { odds: 120, book: "FanDuel" } },
      posted: { id: "p1", pick: "Buffalo -2.5", market: "Spread", marketKey: "spreads", odds: -110, book: "DraftKings", status: "pending", result: null } }),
    /* Monday: the margin model (no quarterback term), a cold night */
    game(401900005, "2026-11-10T01:15Z", T.CHI, T.GB, { probHome: 0.553, margin: 1.8, total: 41.4, sd: 5.0, model: "margin", tv: "ESPN, ABC", venue: { name: "Lambeau Field", city: "Green Bay", state: "WI", country: "USA", indoor: false },
      parts: { home: 2.3, rating: 0.4, epa: null, qb: null, rest: 0, injuries: -0.9 },
      injuries: { away: inj(0.6, [["Kyler Gordon", "CB", "Questionable", 8]]), home: inj(1.5, [["Jordan Love", "QB", "Questionable", 8], ["Josh Jacobs", "RB", "Out", 6]]) },
      weather: { mph: 18, dir: "NW", temp: 31, unit: "F", precip: 40, text: "Chance Snow Showers", at: "2026-11-09T19:00:00-06:00", source: NWS },
      leanFrom: { home: from(0.553, 0.126, 135), away: from(0.447, 0.126, 212) } })
  ];
  window.NFL_WEEK_DATA = {
    sample: false, source: "ESPN public scoreboard, schedules and injury report; nflverse; National Weather Service",
    attribution: "NFL schedules, results, EPA and starting quarterbacks from nflverse (github.com/nflverse/nflverse-data), CC BY 4.0. Weather: National Weather Service. Scores, schedules and injuries: ESPN.",
    generatedAt: at, checkedAt: null, season: 2026,
    week: { type: 2, number: 9, label: "Week 9", start: "2026-11-04T08:00Z", end: "2026-11-11T07:59Z", from: "2026-11-06T01:15:00.000Z", to: "2026-11-10T01:15:00.000Z", games: games.length, byes: ["CAR", "TB"] },
    model: { name: "EdgeLine NFL game model", basis: "game data only: results, EPA and the starting quarterbacks from nflverse; schedules, rest and the injury report from ESPN",
      heldOut: { asOf: "2026-11-08", measure: "log-loss", coin: 0.693, moneyline: { model: 0.6234, close: 0.6094, games: 3532, seasons: "2012-2026", slope: 1.08, slopeSe: 0.1 }, spread: { from: 0.7, to: 0.712 }, total: { from: 0.709, to: 0.713 } } },
    record: { since: { at: at, date: "2026-11-04", season: 2026, type: 2, week: 9, label: "Week 9" }, week: { label: "Week 9", w: 0, l: 0, p: 0, pending: 6, pct: null, avgProb: null }, season: { w: 0, l: 0, p: 0, pending: 6, pct: null, avgProb: null } },
    games: games
  };
})();
