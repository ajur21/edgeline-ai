/* EdgeLine AI: every play in one list (2026-11-11).
   Owner: "the picks for parlays or plays of the day can also be props. It's ANY play." So a play is either a game lean
   (data/picks.js) or a player prop (data/props.js), and this file turns both into one shape, ranks them together and
   finds the day's play and parlay. The home page and the pipeline (scripts/of-day.js) both use it, so the list a reader
   sees and the choice the pipeline locks cannot drift apart.

   The rule (owner, 2026-11-11: "likeliest to hit"):
   - a play counts only while its game is still to start and it beats its price: chance x decimal price - 1 > 0;
   - a lean's chance is our probability from the game model, as posted. A lean that slipped under its bar since is out;
   - a prop's chance is the board's stated chance CHECKED against how props have actually finished (checked below): the
     board states 70%+ on its High props and they have hit about 55%, so the stated number is never compared with a
     lean's as it stands. A prop is still graded on game data only; its price says where to bet and whether the offer
     is worth it, exactly as on the props page;
   - order: Eastern game day first, then the likeliest, then expected value;
   - the play of the day is the first play of today's games; the parlay of the day is the likeliest two plays from
     different games that one book prices, each beating its price there. Three legs are never likelier than two.

   Exports are a contract (scripts/of-day.js, index.html): add names, never rename or remove them. */
(function (root, factory) {
  var node = typeof module === "object" && module && module.exports;
  var api = factory(node ? require("./props-grade.js") : root.EdgeLineProps);
  if (node) module.exports = api; else root.EdgeLinePlays = api;
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this, function (G) {
  "use strict";

  var RULES = {
    keepDefault: 0.3,   /* share of a stated edge over 50% kept when there is no record to check against */
    keepPrior: 200,     /* a league's own record counts in full only well past this many graded props */
    lockUTC: [20, 30],  /* the afternoon run (3:30 PM ET in winter): game lines and prop lines are both in */
    earlyMs: 2 * 36e5   /* a play starting before the lock run can be trusted to have happened locks at the morning run */
  };

  /* ---------- prices ---------- */
  function decimal(o) { o = Number(o); return o > 0 ? 1 + o / 100 : 1 + 100 / -o; }
  function implied(o) { return 1 / decimal(o); }
  function american(dec) { return dec >= 2 ? Math.round((dec - 1) * 100) : -Math.round(100 / (dec - 1)); }
  function r4(n) { return Math.round(n * 1e4) / 1e4; }
  function evOf(prob, odds) { return prob * decimal(odds) - 1; }

  /* ---------- days and the lock ---------- */
  var ET_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
  function dayOf(iso) { var t = typeof iso === "number" ? iso : Date.parse(iso || ""); return isFinite(t) ? ET_DAY.format(new Date(t)) : ""; }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  /* when an Eastern day's play and parlay lock, in ms: the afternoon run's slot on that date */
  function lockAt(day) { return Date.parse(day + "T" + pad(RULES.lockUTC[0]) + ":" + pad(RULES.lockUTC[1]) + ":00Z"); }
  /* a play that starts too soon after the lock moment to wait for the lock run (GitHub starts a scheduled run late) */
  function startsEarly(play, day) { var t = Date.parse(play && play.commence || ""); return isFinite(t) && t < lockAt(day) + RULES.earlyMs; }

  /* ---------- the check: a prop's stated chance against how props have finished ----------
     keep = how much of the stated edge over 50% the graded record has borne out: sum(hit - 0.5) / sum(stated - 0.5)
     over every prop decided win or loss. 1 = the board is as good as it says, 0 = a coin flip whatever it says.
     Each league's own number is pulled toward all leagues' until it has a few hundred props behind it. */
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function rawKeep(s) { var d = s.stated - s.n / 2; return s.n > 0 && d > 0 ? (s.w - s.n / 2) / d : null; }
  /* sums: { NBA: { n, w, stated }, NFL: {...} } with n = props decided win or loss, w = wins, stated = sum of stated chances */
  function checkFrom(sums) {
    var all = { n: 0, w: 0, stated: 0 }, out = {};
    Object.keys(sums || {}).forEach(function (lg) { var s = sums[lg]; if (!s || !(s.n > 0)) return; all.n += s.n; all.w += s.w; all.stated += s.stated; });
    function row(s, toward) {
      var raw = rawKeep(s), keep = raw == null ? toward : clamp01((s.n * raw + RULES.keepPrior * toward) / (s.n + RULES.keepPrior));
      return { n: s.n, hit: s.n ? r4(s.w / s.n) : null, stated: s.n ? r4(s.stated / s.n) : null, keep: r4(keep) };
    }
    out.all = row(all, RULES.keepDefault);
    Object.keys(sums || {}).sort().forEach(function (lg) { if (sums[lg] && sums[lg].n > 0) out[lg] = row(sums[lg], out.all.keep); });
    return out;
  }
  function keepFor(league, check) {
    var c = check && (check[league] || check.all);
    return c && typeof c.keep === "number" && isFinite(c.keep) ? c.keep : RULES.keepDefault;
  }
  function checked(stated, league, check) { return 0.5 + keepFor(league, check) * (Number(stated) - 0.5); }
  function checkOf(propsData) { return (propsData && propsData.results && propsData.results.check) || null; }

  /* ---------- one game, whichever file names it ---------- */
  function nick(name) { return String(name || "").trim().split(/\s+/).pop().toLowerCase(); }
  function looseKey(league, day, home) { return league + "|" + day + "|" + nick(home); }
  /* props games by league, day and home club, so a lean with no ESPN id on it still meets its game's props */
  function aliasOf(propsData) {
    var a = {};
    ((propsData && propsData.games) || []).forEach(function (g) {
      if (!g || g.id == null || !g.home) return;
      a[looseKey(G ? G.leagueOf(g) : g.league, dayOf(g.start), g.home.name)] = "espn:" + g.id;
    });
    return a;
  }
  function leanGameKey(p, alias) {
    var id = p.context && p.context.espnEventId;
    if (id) return "espn:" + id;
    var k = looseKey(p.league || p.sport, dayOf(p.commence), p.home);
    return (alias && alias[k]) || k;
  }

  /* ---------- game leans ---------- */
  /* open: pending, not started at `now` (ms), with a probability and a price */
  function leanOpen(p, now) {
    var t = Date.parse(p && p.commence || "");
    return !!p && !!p.id && (p.status || "pending") === "pending" && p.started !== true && isFinite(t) && t > now && p.modelProb != null && isFinite(Number(p.modelProb)) && p.odds != null;
  }
  function leanPlay(p, alias) {
    var prob = Number(p.modelProb);
    return { kind: "lean", id: p.id, sport: p.sport, league: p.league || p.sport, sportKey: p.sportKey || null, event: p.event, home: p.home || null, away: p.away || null,
      gameKey: leanGameKey(p, alias), commence: p.commence, day: dayOf(p.commence), pick: p.pick, market: p.market || "", prob: r4(prob), stated: r4(prob),
      odds: p.odds, book: p.book || null, prices: p.prices || {}, ev: r4(evOf(prob, p.odds)), tier: p.confidence || null, slipped: p.standing === "below" || p.standing === "gone", src: p };
  }
  /* every open lean as a play; opts.slipped keeps the ones under their bar now (the page lists them last, never as a candidate) */
  function leanPlays(picksData, now, opts) {
    opts = opts || {};
    return ((picksData && picksData.picks) || []).filter(function (p) { return leanOpen(p, now); }).map(function (p) { return leanPlay(p, opts.alias); })
      .filter(function (x) { return opts.slipped ? true : !x.slipped && x.ev > 0; });
  }

  /* ---------- player props ---------- */
  function propId(league, gameId, playerId, stat, side, line) { return ["prop", league, gameId, playerId, stat, side, line].join("-"); }
  var NBA_LABELS = { pts: ["Points", "PTS"], reb: ["Rebounds", "REB"], ast: ["Assists", "AST"], threes: ["Threes", "3PM"], pra: ["Pts + Reb + Ast", "PRA"] };
  function statLabels(propsData) {
    var m = {}, lgs = (propsData && propsData.leagues) || {};
    Object.keys(NBA_LABELS).forEach(function (k) { m["NBA|" + k] = { key: k, label: NBA_LABELS[k][0], short: NBA_LABELS[k][1] }; });
    Object.keys(lgs).forEach(function (lg) { ((lgs[lg] && lgs[lg].stats) || []).forEach(function (s) { if (s && s.key) m[lg + "|" + s.key] = s; }); });
    return m;
  }
  function pickText(name, side, line, label) { return name + " " + side + " " + line + " " + String(label || "").toLowerCase(); }
  /* one graded side (js/props-grade.js sideFor) as a play, at its checked chance */
  function propPlay(s, prob, ev, env) {
    var p = s.p, lg = G.leagueOf(p), g = env.games[p.gameId], lab = env.labels[lg + "|" + s.k] || {}, label = lab.label || s.k;
    var ln = p.lines && p.lines[s.k], px = ln ? ln[s.side] : null, prices = {};
    if (px && px.books) Object.keys(px.books).forEach(function (b) { if (px.books[b] != null) prices[b] = px.books[b]; });
    if (px && px.book && px.odds != null && prices[px.book] == null) prices[px.book] = px.odds;
    var start = G.startOf(p, env.ctx), t = Date.parse(start || "");
    return { kind: "prop", id: propId(lg, p.gameId, p.id, s.k, s.side, s.line), sport: lg, league: lg, sportKey: (g && g.sportKey) || p.sportKey || null,
      event: g && g.home && g.away ? g.away.name + " @ " + g.home.name : (p.home ? (p.oppAbbr || "") + " @ " + (p.teamAbbr || "") : (p.teamAbbr || "") + " @ " + (p.oppAbbr || "")),
      home: g && g.home ? g.home.name : null, away: g && g.away ? g.away.name : null, gameKey: "espn:" + p.gameId, gameId: String(p.gameId),
      commence: isFinite(t) ? new Date(t).toISOString() : null, day: G.dayOf(p, env.ctx), pick: pickText(p.name, s.side, s.line, label), market: label,
      prob: r4(prob), stated: r4(s.prob), odds: s.odds, book: s.book || null, prices: prices, ev: r4(ev), tier: s.grade.tier, slipped: false,
      player: { id: String(p.id), name: p.name, pos: p.pos || null, teamId: p.teamId != null ? String(p.teamId) : null, teamAbbr: p.teamAbbr || null, oppAbbr: p.oppAbbr || null, home: !!p.home, headshot: p.headshot || null },
      stat: s.k, statLabel: label, statShort: lab.short || label, side: s.side, line: s.line, proj: s.proj, l10: s.hit.l10.slice(0, 2),
      reasons: (s.reasons || []).slice(0, 3).map(function (x) { return x.label; }), linesAt: p.linesAt || null, src: s };
  }
  /* every player's likeliest side that still beats its price, one per player. opts: check (else the file's own),
     all: true keeps a player's likeliest priced side even when it does not beat its price (flagged worth: false) */
  function propPlays(propsData, now, opts) {
    opts = opts || {};
    if (!G || !propsData || !Array.isArray(propsData.players)) return [];
    var check = opts.check || checkOf(propsData), games = {};
    (propsData.games || []).forEach(function (g) { if (g && g.id != null) games[g.id] = g; });
    var env = { ctx: G.context(propsData), games: games, labels: statLabels(propsData) }, out = [];
    propsData.players.forEach(function (p) {
      var lg = G.leagueOf(p), best = null, start = Date.parse(G.startOf(p, env.ctx) || "");
      if (!isFinite(start) || start <= now) return;
      var read = Date.parse(p.linesAt || "");
      if (isFinite(read) && read >= start) return; /* a line read after the start is never a play */
      G.keysOf(p, env.ctx).forEach(function (k) {
        if (!G.boardable(p, k, now, env.ctx)) return;
        var s = G.sideFor(p, k, G.postedLine(p, k), env.ctx);
        if (!s || s.odds == null) return;
        var prob = checked(s.prob, lg, check), ev = evOf(prob, s.odds), worth = ev > 0;
        if (!worth && !opts.all) return;
        var c = { s: s, prob: prob, ev: ev, worth: worth };
        if (!best || (c.worth !== best.worth ? c.worth : c.prob > best.prob || (c.prob === best.prob && c.ev > best.ev))) best = c;
      });
      if (best) { var play = propPlay(best.s, best.prob, best.ev, env); play.worth = best.worth; out.push(play); }
    });
    return out;
  }

  /* ---------- the one list ---------- */
  function cmp(a, b) { return (a.day < b.day ? -1 : a.day > b.day ? 1 : 0) || (b.prob - a.prob) || (b.ev - a.ev) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); }
  function rank(plays) { return (plays || []).slice().sort(cmp); }
  /* every play that beats its price, leans and props together, in order. propsData may be null (leans only) */
  function all(picksData, propsData, now, opts) {
    opts = opts || {};
    var alias = aliasOf(propsData);
    return rank(leanPlays(picksData, now, { alias: alias }).concat(propPlays(propsData, now, { check: opts.check })));
  }
  /* the first play of `day` not already used */
  function top(plays, day, used) { return rank((plays || []).filter(function (x) { return x.day === day && !(used && used[x.id]); }))[0] || null; }
  /* the likeliest two plays of `day` from different games at one book, each beating its price there; the better payout
     breaks a tie between books. Returns { book, legs: [play, play], legPrices, decimal, odds, fairProb, ev } or null */
  function parlay(plays, day) {
    var legsAll = (plays || []).filter(function (x) { return x.day === day && x.prices && Object.keys(x.prices).length; }), books = {}, best = null;
    legsAll.forEach(function (x) { Object.keys(x.prices).forEach(function (b) { books[b] = true; }); });
    Object.keys(books).sort().forEach(function (book) {
      var legs = rank(legsAll.filter(function (x) { return x.prices[book] != null && evOf(x.prob, x.prices[book]) > 0; }));
      for (var i = 0; i < legs.length; i++) for (var j = i + 1; j < legs.length; j++) {
        var a = legs[i], b = legs[j];
        if (a.gameKey === b.gameKey) continue;
        var dec = decimal(a.prices[book]) * decimal(b.prices[book]), fair = a.prob * b.prob, ev = fair * dec - 1;
        if (!(ev > 0)) continue;
        if (!best || fair > best.fair + 1e-9 || (Math.abs(fair - best.fair) <= 1e-9 && dec > best.dec + 1e-9)) best = { book: book, legs: [a, b], dec: dec, fair: fair, ev: ev };
      }
    });
    return best ? { book: best.book, legs: best.legs, legPrices: best.legs.map(function (l) { return l.prices[best.book]; }), decimal: r4(best.dec), odds: american(best.dec), fairProb: r4(best.fair), ev: r4(best.ev) } : null;
  }
  /* where the day stands for a reader at `now` (ms): locked plays come from the pipeline (PICKS_DATA.playOfDay); until
     then the front-runner is the first play of today's list. Returns { day, lockAt, late, play, parlay } */
  function frontRunner(plays, now) {
    var day = dayOf(now);
    return { day: day, lockAt: lockAt(day), late: now >= lockAt(day), play: top(plays, day), parlay: parlay(plays, day) };
  }

  return {
    RULES: RULES, decimal: decimal, implied: implied, american: american, evOf: evOf, dayOf: dayOf, lockAt: lockAt, startsEarly: startsEarly,
    checkFrom: checkFrom, keepFor: keepFor, checked: checked, checkOf: checkOf, aliasOf: aliasOf, leanGameKey: leanGameKey,
    leanOpen: leanOpen, leanPlay: leanPlay, leanPlays: leanPlays, propId: propId, pickText: pickText, propPlays: propPlays,
    cmp: cmp, rank: rank, all: all, top: top, parlay: parlay, frontRunner: frontRunner
  };
});
