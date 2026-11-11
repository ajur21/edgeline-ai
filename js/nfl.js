/* ==========================================================================
   EdgeLine AI — the NFL week hub (2026-11-10; owner: "I want to focus on NFL next").
   Spreads and totals show no signal and the moneyline bars are 9 to 12 points, so the NFL has had almost no lean on the
   board and an NFL fan found only a schedule. This is every game of the NFL week on one view, from data/nfl-week.js
   (window.NFL_WEEK_DATA, written by scripts/nfl-week.js): the model's projected winner and score with its probability,
   the quarterbacks it assumed, the injuries it charged for, the weather at outdoor stadiums, the posted lean or else the
   moneyline price at which each side would become one, and the way to the game page and the game's props.
   1. picks.html?sport=NFL: js/browse.js asks hub() for the section and puts it in the NFL panel.
   2. game.html, an NFL game: js/browse.js asks gameSection() for the same block (#forecast).
   The projected winner is a FORECAST, locked at kickoff and graded straight up, with a running record. It is never
   called a lean and no copy claims an edge: the held-out check (calibrated against results, nothing beyond the closing
   price) is said once, from the numbers in the data. The spread and the total are never offered.
   Without the file, with a sample file or with no week in it, hub() and gameSection() return null and both pages stay
   exactly as they were. All text goes in through EdgeLine.el (textContent). Exposes window.EdgeLineNFL.
   ========================================================================== */
(function () {
  "use strict";
  const E = window.EdgeLine;
  if (!E) return;
  const el = E.el, KEY = "americanfootball_nfl";
  function TM() { return window.EdgeLineTeams || null; }
  /* "lean" or "pick": the site's one switch (data/replay.js `call`) */
  function word() { try { const v = E.word("one"); if (typeof v === "string" && v) return v; } catch (e) { /* the default below */ } return "lean"; }

  /* ---------- the data: real, with a week of games; anything else and there is no hub ---------- */
  function data() {
    const d = window.NFL_WEEK_DATA;
    if (!(d && d.sample === false && d.week && Array.isArray(d.games) && d.games.length)) return null;
    /* a file left behind (no full run for days) is not shown as this week's: three days past the end of its week it is gone */
    const end = Date.parse(d.week.end || "");
    return Number.isFinite(end) && end + 3 * 864e5 < E.now() ? null : d;
  }
  const OFF = /POSTPONED|CANCELED|CANCELLED/i;
  const num = v => typeof v === "number" && Number.isFinite(v);
  function norm(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
  function lower(s) { return String(s || "").toLowerCase(); }
  function kick(g) { return Date.parse(g.kickoff || ""); }
  function dayOf(g) { return E.dayKey({ commence: g.kickoff }); }
  function one(n) { return (Math.round(Number(n) * 10) / 10).toFixed(1); }
  function mono(text) { return el("span", { class: "mono", text: text }); }

  /* ---------- a hub game and the page's own game (js/browse.js: the board's, or ESPN's schedule) ---------- */
  function sameClub(name, t) {
    if (!name || !t) return false;
    const tm = TM(), r = tm ? tm.find(KEY, name) : null;
    return r ? String(r.id) === String(t.id) : norm(name) === norm(t.name);
  }
  /* is browse's game `bg` this hub game? ESPN's id when browse has it, else the two clubs within half a day */
  function matches(bg, g) {
    if (!bg || !g) return false;
    const id = bg.espnId || (bg.espn && bg.espn.espnId) || null;
    if (id) return String(id) === String(g.id);
    const t = Date.parse(bg.commence || "");
    if (Number.isFinite(t) && Math.abs(t - kick(g)) > 12 * 36e5) return false;
    return sameClub(bg.home, g.home) && sameClub(bg.away, g.away);
  }
  function forGame(bg) {
    const d = data();
    if (!d || !bg || (bg.sport && bg.sport !== "NFL")) return null;
    return d.games.find(function (g) { return matches(bg, g); }) || null;
  }
  /* where a game stands, by the file, ESPN's fresher read when the page has one, and the site's one clock:
     upcoming | soon | live | awaiting | final | off (postponed) */
  function stateOf(g, ev) {
    if (g.result) return "final";
    if (OFF.test(g.status || "")) return "off";
    if (g.state === "post" || (ev && ev.state === "post")) return "final";
    if (g.state === "in" || (ev && ev.state === "in")) return "live";
    return E.gameState({ sport: "NFL", sportKey: KEY, commence: g.kickoff });
  }
  function isOpen(st) { return st === "upcoming" || st === "soon"; }
  function scoreOf(g, ev) {
    if (ev && (ev.state === "in" || ev.state === "post") && num(ev.home && ev.home.score) && num(ev.away && ev.away.score)) return { home: ev.home.score, away: ev.away.score, detail: ev.detail || "" };
    const r = g.result;
    if (r && num(r.home) && num(r.away)) return { home: r.home, away: r.away, detail: "Final" };
    return g.score && num(g.score.home) && num(g.score.away) ? { home: g.score.home, away: g.score.away, detail: g.detail || "" } : null;
  }
  function espnHref(g) { return "game.html?espn=" + encodeURIComponent(g.id) + "&league=" + KEY + "&date=" + String(dayOf(g)).replace(/-/g, ""); }
  function propsHref(g) { return "props.html?league=NFL&game=" + encodeURIComponent(g.id); }
  function title(g) { return g.away.name + (g.neutral ? " v " : " @ ") + g.home.name; }
  function shortTitle(g) { return g.away.abbr + (g.neutral ? " v " : " @ ") + g.home.abbr; }
  function when(g) { return g.timeValid === false ? E.startLabel({ commence: g.kickoff }).replace(/\s\d{1,2}:\d{2}\s[AP]M ET$/, "") + ", time to be set" : E.startLabel({ commence: g.kickoff }); }

  /* ---------- the pieces of a game ---------- */
  /* away @ home with logos, the projected winner ringed in its colour (EdgeLineTeams.matchup); no winner, both lit */
  function matchup(g, size) {
    const tm = TM(); if (!tm) return null;
    const p = g.projection, w = p ? g[p.winner] : null;
    const node = tm.matchup({ sport: "NFL", sportKey: KEY, home: g.home.name, away: g.away.name, outcome: w ? { name: w.name } : null, pick: w ? w.name + " ML" : "" }, { size: size, abbr: size !== "sm" });
    if (!node) return null;
    if (!w) node.querySelectorAll(".mu-team").forEach(function (n) { n.classList.remove("is-off"); });
    if (g.neutral) { const at = node.querySelector(".mu-at"); if (at) at.textContent = "v"; node.setAttribute("aria-label", g.away.name + " v " + g.home.name + ", neutral site"); }
    return node;
  }
  /* the probability bar: fill = our probability that the projected winner wins, tick = what the best moneyline price
     implies when the board has one, hairline = a coin flip */
  function probBar(g, st) {
    const p = g.projection, w = g[p.winner], b = isOpen(st) && g.board ? g.board[p.winner] : null, imp = b && num(b.odds) && b.odds !== 0 ? E.impliedProb(b.odds) : null;
    const fill = el("span", { class: "prob-fill" }); fill.style.width = Math.max(0, Math.min(100, p.prob * 100)).toFixed(1) + "%";
    const kids = [fill];
    if (imp != null) { const t = el("span", { class: "prob-tick" }); t.style.left = Math.max(0, Math.min(100, imp * 100)).toFixed(1) + "%"; kids.push(t); }
    const say = "Our probability that the " + w.short + " win: " + E.pct(p.prob) + ", from the game data" + (imp != null ? "; the best moneyline price implies " + E.pct(imp) : "");
    return el("div", { class: "prob", role: "img", "aria-label": say, title: say + ". The hairline is a coin flip." }, [el("div", { class: "prob-bar" }, kids)]);
  }
  /* "WSH: Jayden Daniels", "MIA: Tua Tagovailoa, in for Malik Willis (injured reserve)", "NYG: J.J. McCarthy, listed questionable" */
  function qbText(q, t) {
    if (!q || !q.name) return t.abbr + ": no starter known, read as a replacement-level quarterback";
    const bits = [t.abbr + ": " + q.name];
    if (q.kind === "backup" && q.replaces) bits.push("in for " + q.replaces + (q.replacesStatus ? " (" + lower(q.replacesStatus) + ")" : ""));
    else if (q.kind === "change" && q.lastStarter) bits.push("a change from " + q.lastStarter);
    else if (q.kind === "assumed") bits.push("assumed from the club’s last game");
    if (q.status) bits.push("listed " + lower(q.status) + (q.kind === "backup" ? " himself" : ""));
    return bits.join(", ");
  }
  function qbLine(g) {
    const q = g.qb;
    if (!q) return E.meta(["Quarterbacks", g.projection && g.projection.model === "margin" ? "not read for this game: it ran on the margin model, which has no quarterback term" : "not read for this game"], "nfl-line nfl-qb");
    const line = E.meta(["Quarterbacks", qbText(q.away, g.away), qbText(q.home, g.home)], "nfl-line nfl-qb");
    line.title = "The starters the model assumed. A quarterback listed out or doubtful is replaced by the club’s next one, and the gap is priced in the quarterback term" + (num(q.points) && q.points !== 0 ? ": " + one(Math.abs(q.points)) + " points toward the " + (q.points > 0 ? g.home.short : g.away.short) + " here" : "") + ".";
    return line;
  }
  function statusClass(s) { return /^(out|injured|ir|doubtful|suspended)/i.test(s || "") ? "inj-out" : s ? "inj-q" : ""; }
  /* the injuries the model charged for: the points by club in the summary, the names one tap away (open on the game page) */
  function injuryBlock(g, open) {
    const inj = g.injuries;
    if (!inj) return null;
    const sides = [["away", g.away], ["home", g.home]], any = sides.some(function (s) { return inj[s[0]] && (inj[s[0]].list.length || inj[s[0]].more); });
    const sum = E.meta(["Injuries charged"].concat(sides.map(function (s) { const x = inj[s[0]] || { points: 0, list: [], more: 0 }, n = x.list.length + x.more; return s[1].abbr + (n ? " " + one(x.points) + " pts, " + n + " listed" : " none"); })), "nfl-line");
    if (!any) return el("p", { class: "nfl-inj-none" }, [sum]);
    const lists = sides.map(function (s) {
      const x = inj[s[0]]; if (!x || !(x.list.length || x.more)) return null;
      return el("div", { class: "nfl-inj-team" }, [
        el("strong", { text: s[1].short }),
        el("ul", { class: "nfl-inj-list" }, x.list.map(function (i) { return el("li", {}, [el("span", { class: "inj-status " + statusClass(i.status), text: i.status || "Listed" }), " " + i.name + (i.pos ? " (" + i.pos + ")" : "")]); })
          .concat(x.more ? [el("li", { class: "nfl-inj-more", text: "and " + x.more + " more" })] : []))
      ]);
    });
    const d = el("details", { class: "nfl-inj" }, [el("summary", { title: "Players out or limited who were in the club’s results so far: what the model took off for them, in points. A quarterback is priced in the quarterback line instead." }, [sum])].concat(lists));
    if (open) d.setAttribute("open", "");
    return d;
  }
  function weatherLine(g) {
    const w = g.weather;
    if (!w) return E.meta(["Weather", g.venue && g.venue.indoor ? "indoors" : g.neutral ? "no forecast read for a neutral site" : "no forecast read for this stadium yet"], "nfl-line nfl-wx");
    /* the forecast's own words on a dry hour ("mostly cloudy"); the chance once rain or snow is a real one */
    const sky = num(w.precip) && w.precip >= 15 ? w.precip + "% chance of " + (/snow|flurr|sleet|ice/i.test(w.text || "") || (num(w.temp) && w.temp <= 32) ? "snow" : "rain") : w.text ? lower(w.text) : null;
    const line = E.meta(["Weather", num(w.temp) ? w.temp + "°" + (w.unit || "F") : null, num(w.mph) ? "wind " + w.mph + " mph" + (w.dir ? " " + w.dir : "") : null, sky], "nfl-line nfl-wx");
    line.title = "The hour of kickoff, from the " + (w.source || "National Weather Service") + "’s forecast.";
    return line;
  }
  /* the posted lean, linked to its card; else the moneyline price at which each side would clear its own bar
     (EdgeLine.clearPrice, the pipeline's valueTo), beside the best price now when the board has one. Moneyline only. */
  function leanLine(g, opts) {
    const posted = g.posted && g.posted.id && g.posted.status === "pending" ? g.posted : null;
    if (posted) {
      const a = el("a", { class: "nfl-lean-link", href: opts && opts.leanHref ? opts.leanHref : "picks.html?sport=NFL#" + encodeURIComponent(posted.id), "data-lean": posted.id, text: posted.pick });
      return E.meta([el("span", { class: "badge badge-status badge-pick", text: "Our " + word() }), a, el("span", {}, [mono(E.fmtOdds(posted.odds)), posted.book ? " at " + posted.book : ""])], "nfl-line nfl-lean is-posted");
    }
    const lf = g.leanFrom;
    if (!lf) return null;
    function side(which) {
      const x = lf[which], t = g[which], v = x ? E.clearPrice(x.prob, x.bar) : null, b = g.board ? g.board[which] : null;
      const kids = [t.abbr + " "];
      if (v == null) kids.push("at no price");
      else kids.push(mono(E.fmtOdds(v)));
      if (b && num(b.odds) && b.odds !== 0) { kids.push(", best now "); kids.push(mono(E.fmtOdds(b.odds))); if (b.book) kids.push(" at " + b.book); }
      return el("span", { class: "nfl-from", "data-side": which, "data-price": v == null ? "" : String(v), title: x ? "Our " + E.pct(x.prob) + " for the " + t.short + " less this side’s bar of " + (x.bar * 100).toFixed(1) + " points" + (v == null ? ": no price clears it" : ": a moneyline of " + E.fmtOdds(v) + " or longer clears it") : null }, kids);
    }
    let priced = null;
    if (!g.board && opts && typeof opts.firstRun === "function" && typeof opts.runWord === "function") {
      const t = opts.firstRun("NFL", kick(g));
      priced = Number.isFinite(t) && t > E.now() ? "priced from " + opts.runWord(t) : "no price read yet";
    }
    return E.meta([el("span", { text: "Moneyline " + word() + " from" }), side("away"), side("home"), priced], "nfl-line nfl-lean");
  }

  /* ---------- a game still to start: one card ---------- */
  function rankChip(n) {
    const c = E.rankChip(n);
    if (c) c.title = n === 1 ? "The likeliest projected winner on the first game day" : "Rank " + n + ": game day first, then our probability for the projected winner";
    return c;
  }
  function card(g, st, o) {
    o = o || {};
    const p = g.projection, w = p ? g[p.winner] : null, l = p ? g[p.winner === "home" ? "away" : "home"] : null;
    const posted = g.posted && g.posted.id && g.posted.status === "pending";
    const head = el("div", { class: "pick-head" }, [
      el("span", { class: "pick-head-left" }, [o.rank ? rankChip(o.rank) : null, el("span", { class: "badge badge-sport", "data-sport": "NFL", text: "NFL" })]),
      el("span", { class: "pick-head-right" }, [st === "soon" ? el("span", { class: "badge badge-state badge-soon", text: "Starts soon" }) : null, el("span", { class: "badge badge-status badge-none", title: "A forecast, graded straight up: did the projected winner win", text: "Forecast" })])
    ]);
    const eventLine = el("div", { class: "pick-event" }, [o.href ? el("a", { class: "pick-game-link", href: o.href, title: "Open the game page", text: title(g) }) : title(g)]);
    const body = el("div", {}, [
      matchup(g),
      eventLine,
      el(o.heading || "h4", { class: "pick-selection", text: p ? w.short + " to win" : "No forecast yet" }),
      p ? E.meta(["Projected score", el("span", {}, [w.abbr + " ", mono(one(p[p.winner]))]), el("span", {}, [l.abbr + " ", mono(one(p[p.winner === "home" ? "away" : "home"]))])], "pick-market nfl-score")
        : el("p", { class: "pick-rationale", text: "The model has no finished game to build one of these clubs on yet, so it says nothing here." })
    ]);
    const kids = [head, body];
    if (p) {
      kids.push(probBar(g, st));
      kids.push(el("div", { class: "pick-metrics" }, [
        el("div", { class: "pick-metric lead", title: "Our probability that the " + w.short + " win, from the game data" }, [el("div", { class: "k", text: "To win" }), el("div", { class: "v", text: E.pct(p.prob) })]),
        el("div", { class: "pick-metric", title: "The projected margin, the two projected scores apart" }, [el("div", { class: "k", text: "Margin" }), el("div", { class: "v", text: one(Math.abs(p.margin)) + " pts" })]),
        num(p.marginSd) && p.marginSd > 0 ? el("div", { class: "pick-metric", title: "The model’s own error on that margin, one standard error" }, [el("div", { class: "k", text: "Give or take" }), el("div", { class: "v", text: one(p.marginSd) + " pts" })]) : null
      ]));
      kids.push(el("div", { class: "nfl-lines" }, [qbLine(g), injuryBlock(g, !!o.open), weatherLine(g), leanLine(g, o)]));
    }
    kids.push(el("div", { class: "pick-foot" }, [
      el("span", {}, [E.meta([when(g), g.neutral && g.venue && g.venue.city ? "neutral site, " + g.venue.city : null, g.tv || null])]),
      el("span", { class: "pick-actions" }, [o.href && !o.onGamePage ? el("a", { class: "flip-btn", href: o.href, text: "Game page" }) : null, el("a", { class: "flip-btn", href: propsHref(g), text: "Props" })])
    ]));
    const node = el("article", { class: "card nfl-game" + (posted ? " has-lean" : ""), "data-game": g.id, "data-state": st, "data-day": dayOf(g), "data-prob": p ? String(p.prob) : "", "data-winner": p ? w.abbr : "", "data-rank": o.rank ? String(o.rank) : "" }, kids);
    if (TM() && w) TM().tint(node, { sport: "NFL", sportKey: KEY, home: g.home.name, away: g.away.name, outcome: { name: w.name } });
    return node;
  }

  /* ---------- a game that has started: one row, never something to bet ---------- */
  function resultChip(g, st) {
    const r = g.result, c = r && r.call;
    if (c === "Win") return el("span", { class: "badge badge-state badge-won", title: "The projected winner won", text: "Right" });
    if (c === "Loss") return el("span", { class: "badge badge-state badge-lost", title: "The projected winner lost", text: "Wrong" });
    if (c === "Push") return el("span", { class: "badge badge-state badge-push", title: "The game was a tie: a push, counted apart", text: "Tie" });
    if (c === "Void") return el("span", { class: "badge badge-state badge-void", title: "Called off or never finished: not counted", text: "Void" });
    if (st === "live") return el("span", { class: "badge badge-state badge-live", text: "Live" });
    if (st === "awaiting") return el("span", { class: "badge badge-state badge-awaiting", text: "Awaiting result" });
    if (st === "off") return el("span", { class: "badge badge-state badge-void", text: /CANCEL/i.test(g.status || "") ? "Called off" : "Postponed" });
    return el("span", { class: "badge badge-state badge-final", text: "Final" });
  }
  function playedRow(g, st, ev, o) {
    o = o || {};
    const p = g.projection, w = p ? g[p.winner] : null, sc = scoreOf(g, ev), r = g.result, c = r && r.call, t = kick(g);
    const scoreText = sc ? g.away.abbr + " " + sc.away + "–" + sc.home + " " + g.home.abbr : null;
    let note;
    if (c === "Win") note = "Forecast right";
    else if (c === "Loss") note = "Forecast wrong";
    else if (c === "Push") note = "A tie: a push, counted apart";
    else if (c === "Void") note = "Called off: not counted";
    else if (st === "off") note = /CANCEL/i.test(g.status || "") ? "Called off: not counted" : "Postponed: the forecast waits for a new date";
    else if (!p) note = "No forecast was made before kickoff, so nothing is counted";
    else if (st === "final") note = "Graded straight up at the next hourly check";
    else if (st === "awaiting") note = "Past its usual length; graded straight up from the final score";
    else note = "Forecast locked at kickoff";
    const posted = g.posted && g.posted.id ? g.posted : null;
    return el("article", { class: "played nfl-played", "data-game": g.id, "data-state": st, "data-call": c || "" }, [
      el("div", { class: "played-id" }, [resultChip(g, st), el("span", { class: "badge badge-sport", "data-sport": "NFL", text: "NFL" })]),
      el("div", { class: "played-pick" }, [
        matchup(g, "sm"),
        el("strong", { text: p ? w.short + " to win" : "No forecast" }),
        E.meta([shortTitle(g), p ? E.pct(p.prob) + " to win" : null, p ? "projected " + w.abbr + " " + one(p[p.winner]) + ", " + g[p.winner === "home" ? "away" : "home"].abbr + " " + one(p[p.winner === "home" ? "away" : "home"]) : null, Number.isFinite(t) && st !== "off" ? "Started " + E.clockET(t) : null], "leg-event")
      ]),
      el("div", { class: "played-result" }, [
        scoreText ? el("span", { class: "played-score", text: (st === "final" ? "Final " : "") + scoreText }) : null,
        st === "live" && sc && sc.detail ? el("span", { class: "played-note", text: sc.detail }) : null,
        el("span", { class: "played-note nfl-call" + (c === "Win" ? " pos" : c === "Loss" ? " neg" : ""), text: note }),
        posted && (st === "live" || st === "awaiting") ? E.liveSlot(posted.id) : null
      ]),
      el("div", { class: "played-actions" }, [o.href && !o.onGamePage ? el("a", { class: "flip-btn", href: o.href, text: "Game page" }) : null])
    ]);
  }

  /* ---------- the record, the held-out check and when the file was written ---------- */
  function wl(t) { return t.w + "-" + t.l + (t.p ? "-" + t.p : ""); }
  function recordStrip(d) {
    const r = d.record || {}, wk = r.week || null, se = r.season || { w: 0, l: 0, p: 0, pending: 0 };
    const graded = se.w + se.l + se.p, start = r.since && r.since.label ? r.since.label : d.week.label;
    if (!graded) return el("p", { class: "nfl-record is-empty", "data-graded": "0" }, [el("strong", { text: "No forecast graded yet." }), " The record starts with " + start + ": every forecast made before its kickoff is graded straight up when the game ends. Nothing earlier is backfilled."]);
    const rate = num(se.pct) ? E.pct(se.pct) + " right" + (num(se.avgProb) ? ", where the forecasts averaged " + E.pct(se.avgProb) : "") : null;
    const p = el("p", { class: "nfl-record", "data-graded": String(graded) }, [E.meta([
      el("strong", { text: "Forecasts, straight up" }),
      wk ? wk.label + " " + wl(wk) + (wk.pending ? ", " + wk.pending + " to come" : "") : null,
      "Season to date " + wl(se) + (se.p ? " (the third number is ties)" : ""),
      rate,
      r.since && r.since.label ? "since " + r.since.label + ", when the log began; nothing backfilled" : null
    ], "nfl-record-line")]);
    p.title = "Won and lost by the projected winner, every forecast made before its kickoff. A tie is a push; a game called off is not counted.";
    return p;
  }
  /* said once, plainly, from the numbers in the file */
  function checkText(d) {
    const h = d.model && d.model.heldOut, m = h && h.moneyline;
    if (!m) return "What a held-out check found: these win probabilities matched results over past seasons and held no information beyond the closing price. The spread and the total showed no signal, so neither is shown.";
    return "What the held-out check found, over " + Number(m.games).toLocaleString("en-US") + " games from " + String(m.seasons).replace("-", " to ") + ": these win probabilities were calibrated against results (a slope of " + m.slope + ", where 1 is exact) and carried no information beyond the closing price. At the books’ spread and total the model did no better than a coin flip, so neither is shown here.";
  }
  function stamp(d) {
    const made = Date.parse(d.generatedAt || ""), seen = Date.parse(d.checkedAt || "");
    return E.meta([
      Number.isFinite(made) ? "Projected " + E.clockET(made) : null,
      Number.isFinite(seen) && seen > made ? "Scores checked " + E.clockET(seen) : null,
      d.week.byes && d.week.byes.length ? "On a bye: " + d.week.byes.join(", ") : null
    ], "update-line nfl-stamp");
  }
  /* game day first, then the likeliest projected winner; a game with no forecast goes last in its day */
  function openOrder(a, b) {
    const ka = dayOf(a) || "~", kb = dayOf(b) || "~";
    if (ka !== kb) return ka < kb ? -1 : 1;
    const pa = a.projection ? a.projection.prob : -1, pb = b.projection ? b.projection.prob : -1;
    return (pb - pa) || (kick(a) - kick(b)) || String(a.id).localeCompare(String(b.id));
  }
  /* started games: live, then awaiting a result, then the finished ones, newest day first (as the props page lists
     results), the likelier forecast first within a day; a postponed game last */
  const STARTED_RANK = { live: 0, awaiting: 1, final: 2, off: 3 };
  function startedOrder(a, b) {
    const ra = STARTED_RANK[a.st], rb = STARTED_RANK[b.st];
    if (ra !== rb) return ra - rb;
    if (ra < 2) return (kick(a.g) - kick(b.g)) || String(a.g.id).localeCompare(String(b.g.id));
    const ka = dayOf(a.g), kb = dayOf(b.g);
    if (ka !== kb) return ka < kb ? 1 : -1;
    const pa = a.g.projection ? a.g.projection.prob : -1, pb = b.g.projection ? b.g.projection.prob : -1;
    return (pb - pa) || (kick(a.g) - kick(b.g)) || String(a.g.id).localeCompare(String(b.g.id));
  }

  /* ---------- picks.html?sport=NFL: the hub ----------
     ctx: { games: js/browse.js's NFL games (the board's and ESPN's schedule), hrefFor: its game-page link }.
     Returns { node, covers } or null; covers is true when every game browse would list is in the hub. */
  function hub(ctx) {
    const d = data();
    if (!d) return null;
    ctx = ctx || {};
    const list = Array.isArray(ctx.games) ? ctx.games : [];
    const joined = d.games.map(function (g) { const bg = list.find(function (x) { return matches(x, g); }) || null, ev = bg && bg.espn ? bg.espn : null; return { g: g, bg: bg, ev: ev, st: stateOf(g, ev), href: bg && bg.id && typeof ctx.hrefFor === "function" ? ctx.hrefFor(bg) : espnHref(g) }; });
    const open = joined.filter(function (x) { return isOpen(x.st); }).sort(function (a, b) { return openOrder(a.g, b.g); });
    const started = joined.filter(function (x) { return !isOpen(x.st); }).sort(function (a, b) { return startedOrder(a, b); });
    const sec = el("section", { class: "nfl-hub", id: "nfl-week", "aria-labelledby": "nfl-week-h", "data-week": String(d.week.number) });
    sec.appendChild(el("h3", { class: "nfl-hub-title", id: "nfl-week-h", text: d.week.label + " forecasts: every game, likeliest first" }));
    sec.appendChild(el("p", { class: "muted how-to nfl-how", text: "By game day, then by how likely the projected winner is: #1 is the first day’s likeliest. The bar and “To win” are the model’s probability for that club, from game data alone; the projected score is its average result and “Give or take” its own error on the margin. Each forecast is locked at kickoff and graded straight up: did the projected winner win. “Moneyline " + word() + " from” is the price at which a side would clear its own bar and be posted." }));
    sec.appendChild(el("p", { class: "muted nfl-check", text: checkText(d) }));
    sec.appendChild(recordStrip(d));
    sec.appendChild(el("p", { class: "nfl-stamp-row" }, [stamp(d)]));
    if (open.length) {
      const grid = el("div", { class: "picks-grid nfl-grid" }), spans = new Set(open.map(function (x) { return dayOf(x.g); })).size > 1;
      let prev = null, rank = 0;
      open.forEach(function (x) {
        const k = dayOf(x.g);
        if (spans && k !== prev) grid.appendChild(E.dayDivider(k));
        prev = k;
        grid.appendChild(card(x.g, x.st, { rank: x.g.projection ? ++rank : null, href: x.href, firstRun: ctx.firstRun, runWord: ctx.runWord }));
      });
      sec.appendChild(grid);
    } else sec.appendChild(el("p", { class: "nfl-none", text: "Every game of " + d.week.label + " has started. Next week’s forecasts are posted on Tuesday morning." }));
    if (started.length) {
      sec.appendChild(el("h4", { class: "nfl-sub", id: "nfl-played-h", text: "Under way and finished" }));
      sec.appendChild(el("p", { class: "muted how-to nfl-how", text: "A game leaves the list above at kickoff and lands here with its forecast as it stood then: live games first, then the finished ones, newest day first, each with whether the projected winner won." }));
      const box = el("div", { class: "card played-list nfl-played-list" }), done = started.filter(function (x) { return STARTED_RANK[x.st] >= 2; });
      const days = new Set(done.map(function (x) { return dayOf(x.g); })).size > 1;
      let prevDay = null;
      started.forEach(function (x) {
        const k = dayOf(x.g);
        if (days && STARTED_RANK[x.st] >= 2 && k !== prevDay) { box.appendChild(E.dayDivider(k)); prevDay = k; }
        box.appendChild(playedRow(x.g, x.st, x.ev, { href: x.href }));
      });
      sec.appendChild(box);
    }
    wireLeanLinks(sec);
    return { node: sec, covers: list.every(function (bg) { return d.games.some(function (g) { return matches(bg, g); }); }), week: d.week.number, open: open.length, started: started.length };
  }
  /* a posted lean's card is in the panel above the hub: ring it there instead of leaving the tab */
  function wireLeanLinks(scope) {
    scope.querySelectorAll("a.nfl-lean-link[data-lean]").forEach(function (a) {
      a.addEventListener("click", function (ev) {
        if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button) return;
        const id = a.getAttribute("data-lean"), panel = document.getElementById("browse-panel");
        const target = panel ? Array.prototype.find.call(panel.querySelectorAll(".card.pick[data-id]"), function (c) { return c.getAttribute("data-id") === id; }) : null;
        if (!target) return;
        ev.preventDefault();
        target.classList.add("highlight");
        target.scrollIntoView({ block: "center" });
        setTimeout(function () { target.classList.remove("highlight"); }, 2600);
      });
    });
  }

  /* ---------- game.html: the same block for one NFL game (#forecast), or null ---------- */
  function partsList(g) {
    const p = g.projection, x = p && p.parts;
    if (!x) return null;
    const s = v => E.signed(Number(v), 1);
    const rows = [["Home field", x.home], ["Results against the schedule", x.rating], ["EPA a play, offence net of defence", x.epa], ["The quarterbacks", x.qb], ["Rest", x.rest], ["Other injuries", x.injuries]].filter(function (r) { return num(r[1]); });
    if (!rows.length) return null;
    return el("div", { class: "bd-block nfl-parts" }, [
      el("h3", { class: "why-h", text: "How the margin is built" }),
      el("p", { class: "muted", text: "In points toward the " + g.home.short + " (a minus is toward the " + g.away.short + "), from the " + (p.model === "nflverse" ? "football model on nflverse data" : "margin model, the fallback when nflverse’s data does not hold the game") + ", with " + (p.games ? p.games.home + " and " + p.games.away + " games behind the two clubs" : "this season’s games behind it") + "." }),
      el("ul", { class: "bd-list bd-note" }, rows.map(function (r) { return el("li", {}, [r[0] + " ", mono(s(r[1]))]); }).concat([el("li", {}, [el("strong", { text: "In all, the " + g[p.winner].short + " by " + one(Math.abs(p.margin)) }), num(p.marginSd) && p.marginSd > 0 ? ", give or take " + one(p.marginSd) : ""])]))
    ]);
  }
  function gameSection(bg) {
    const d = data(), g = forGame(bg);
    if (!d || !g) return null;
    const ev = bg && bg.espn ? bg.espn : null, st = stateOf(g, ev), open = isOpen(st);
    const kids = [el("h2", { id: "forecast-h", text: "Our forecast" })];
    kids.push(el("p", { class: "muted how-to", text: (open ? "The model’s projected winner and score for this game, from game data alone: results, EPA, the quarterbacks, rest and injuries. " : "The model’s projected winner and score as they stood at kickoff, when the forecast was locked. ") + "It is a forecast, graded straight up: did the projected winner win. The spread and the total are never offered." }));
    kids.push(el("p", { class: "muted nfl-check", text: checkText(d) }));
    if (open) {
      const wrap = el("div", { class: "nfl-forecast" }, [card(g, st, { heading: "h3", open: true, onGamePage: true, leanHref: "#lean" }), g.projection ? partsList(g) : null]);
      kids.push(wrap);
    } else kids.push(el("div", { class: "card played-list nfl-played-list" }, [playedRow(g, st, ev, { onGamePage: true })]));
    kids.push(recordStrip(d));
    kids.push(el("p", { class: "nfl-stamp-row" }, [stamp(d), el("a", { class: "flip-btn nfl-week-link", href: "picks.html?sport=NFL#nfl-week", text: "Every " + d.week.label + " forecast" })]));
    return el("section", { class: "game-sec nfl-forecast-sec", id: "forecast", "aria-labelledby": "forecast-h", "data-game": g.id, "data-state": st }, kids);
  }

  /* ---------- the strip link on the picks page, and a redraw when a game changes state ----------
     "On this page" gets an "NFL week" link only when there is a week to show, so without the file the strip is exactly
     as the page wrote it. It is added as this script loads (before js/subnav.js, which is deferred, collects the links),
     after the list's own link, hidden until the NFL tab shows the hub. */
  function stripLink() {
    let a = document.querySelector('.subnav a[href="#nfl-week"]');
    if (a || !data()) return a;
    const at = document.querySelector('.subnav a[href="#all-picks"]');
    if (!at || !document.getElementById("browse")) return null;
    a = el("a", { href: "#nfl-week", hidden: "", text: "NFL week" });
    at.parentNode.insertBefore(a, at.nextSibling);
    return a;
  }
  function syncStrip(on) { const a = stripLink(); if (a) a.hidden = !on; }
  stripLink();
  const watchers = [];
  let sig = null, timer = null;
  function signature() { const d = data(); return d ? d.games.map(function (g) { return stateOf(g, null).charAt(0); }).join("") : ""; }
  function tick() { const s = signature(); if (sig !== null && s !== sig) watchers.slice().forEach(function (fn) { fn(); }); sig = s; }
  /* a page registers its redraw; the first registration starts the minute timer (only when there is a week to watch) */
  function onChange(fn) {
    if (typeof fn === "function") watchers.push(fn);
    if (timer || !data()) return;
    sig = signature();
    timer = setInterval(tick, 60e3);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) tick(); });
  }

  /* the next kickoff of the week still ahead by the clock (ms), for the NFL tab's "next game"; null when none */
  function next() {
    const d = data(), now = E.now();
    if (!d) return null;
    const t = d.games.filter(function (g) { return g.timeValid !== false && isOpen(stateOf(g, null)) && kick(g) > now; }).map(kick).sort(function (a, b) { return a - b; })[0];
    return Number.isFinite(t) ? t : null;
  }
  window.EdgeLineNFL = { has: function () { return !!data(); }, data: data, next: next, hub: hub, gameSection: gameSection, forGame: forGame, stateOf: stateOf, syncStrip: syncStrip, onChange: onChange, tick: tick, checkText: checkText };
})();
