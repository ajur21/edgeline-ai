/* ==========================================================================
   EdgeLine AI — early lines on the leans page (2026-11-15; owner: "lets do nfl and college football then live",
   "tracked live first"). From data/early-line.js (window.EARLY_DATA, written by scripts/early-line.js): every NFL and
   FBS game's number, locked the first time DraftKings posted a moneyline and more than 36 hours before kickoff, days
   before the board prices the game; then graded straight up at that price with DraftKings' close.
   They are NOT leans and every line here says so: none is offered as a bet, none is on a ticket or the slip, none can
   be the lean of the day. What the section shows is the test: whether the line moves toward our number by kickoff.
   picks.html: #early-sec (hidden, with its strip link, until the file holds a game). Order: the site's rule, game day
   first, then likeliest (our probability), with rank chips and day headings; graded games newest first.
   All text goes in through EdgeLine.el (textContent). Exposes window.EdgeLineEarly.
   ========================================================================== */
(function () {
  "use strict";
  const E = window.EdgeLine;
  if (!E) return;
  const el = E.el, CAP = 20, RCAP = 10, LEAGUE = { NFL: "NFL", NCAAF: "College football" };
  function TM() { return window.EdgeLineTeams || null; }
  const num = v => typeof v === "number" && Number.isFinite(v);
  const pts = x => E.signed(100 * x, 1) + " pts";
  const kick = g => Date.parse(g.commence || "");
  function data() {
    const d = window.EARLY_DATA;
    return d && d.sample === false && ((d.upcoming || []).length || (d.recent || []).length) ? d : null;
  }
  /* a game as the site's helpers read one (matchup, start label, day key) */
  function asPick(g) { const sk = g.league === "NFL" ? "americanfootball_nfl" : "americanfootball_ncaaf"; return { sport: g.league, sportKey: sk, commence: g.commence, home: g.home.name, away: g.away.name, event: g.away.name + " @ " + g.home.name, outcome: { name: g.team }, pick: g.team + " ML", marketKey: "h2h" }; }
  function rec(t) { return t.w + "-" + t.l + (t.push ? "-" + t.push : ""); }
  function recPart(label, t) {
    if (!t || !t.n) return null;
    const roi = t.n ? E.signed(100 * t.units / t.n, 1) + "% ROI" : "";
    return label + " " + rec(t) + ", " + E.signed(t.units, 2) + "u (" + roi + ")" + (t.moveN ? ", line moved our way on " + t.toward + " of " + t.moveN + " (" + pts(t.move / t.moveN) + " a game)" : "");
  }
  /* where the price stands now against where it was locked: a shorter price on our side is the market moving toward us */
  function moved(g) {
    if (!g.now || !num(g.now.odds) || g.now.odds === g.odds) return { text: "No move yet", cls: "" };
    const toward = E.impliedProb(g.now.odds) > E.impliedProb(g.odds);
    return { text: E.fmtOdds(g.now.odds) + (toward ? ", moved our way" : ", moved away"), cls: toward ? " is-toward" : " is-away" };
  }
  function gameCell(g) {
    const p = asPick(g);
    return el("td", { "data-label": "Game" }, [el("span", { class: "early-game" }, [TM() ? TM().matchup(p, { size: "sm", abbr: false }) : null,
      el("span", { class: "early-game-text" }, [el("span", { class: "early-event", text: p.event }), E.meta([el("span", { class: "badge badge-sport", "data-sport": g.league, text: g.league }), E.startLabel(p)], "early-start")])])]);
  }
  function sideCell(g) {
    return el("td", { "data-label": "Our side" }, [el("strong", { text: g.team }), g.clears ? el("span", { class: "badge early-past", title: "Its edge was past the side's own bar when it locked: on the board this would have been a lean", text: "Past its bar" }) : null]);
  }
  /* "today 8:26 PM ET", "yesterday 10:45 AM ET", "Thu Nov 5, 9:04 AM ET": clockET names the day unless it is today */
  function lockedAt(g) { const t = Date.parse(g.at), c = E.clockET(t); return E.dayKey({ commence: g.at }) === E.dayKey({ commence: new Date(E.now()).toISOString() }) ? "today " + c : c; }
  function lockedCell(g) {
    return el("td", { class: "num", "data-label": "DraftKings when locked" }, [el("span", { class: "mono", text: E.fmtOdds(g.odds) }), el("span", { class: "early-sub", text: lockedAt(g) })]);
  }
  function edgeCell(g) {
    const gap = g.past >= 0 ? (100 * g.past).toFixed(1) + " past its bar" : (100 * -g.past).toFixed(1) + " short of its bar";
    return el("td", { class: "num", "data-label": "Edge" }, [el("span", { class: "mono", text: pts(g.edge) }), el("span", { class: "early-sub", text: gap })]);
  }
  function dayRow(key, cols) { const tr = el("tr", { class: "day-divider" }, [el("td", { colspan: String(cols) }, [el("span", { class: "day-when", text: E.dayLabel(key) })])]); tr.firstChild.setAttribute("data-label", ""); return tr; }
  function table(label, heads, rows) {
    return el("div", { class: "table-wrap early-table" }, [el("table", { class: "data", "aria-label": label }, [
      el("thead", {}, [el("tr", {}, heads.map(h => el("th", { scope: "col", class: h.num ? "num" : null, text: h.t })))]), el("tbody", {}, rows)])]);
  }
  /* the week's locked numbers still to kick off: game day first, then likeliest */
  function upcomingTable(list, all) {
    const heads = [{ t: "Rank" }, { t: "Game" }, { t: "Our side" }, { t: "To hit", num: 1 }, { t: "DraftKings when locked", num: 1 }, { t: "Edge", num: 1 }, { t: "DraftKings now" }];
    const days = new Set(list.map(g => E.dayKey({ commence: g.commence }))).size > 1, rows = [];
    let prev = null;
    list.forEach(function (g, i) {
      const k = E.dayKey({ commence: g.commence });
      if (days && k !== prev) rows.push(dayRow(k, heads.length)); prev = k;
      const mv = moved(g);
      rows.push(el("tr", { class: "early-row" + (g.clears ? " is-past" : ""), "data-game": g.league + "|" + g.id, "data-rank": String(i + 1), "data-prob": String(g.prob) }, [
        el("td", { "data-label": "Rank" }, [E.rankChip(i + 1, true)]), gameCell(g), sideCell(g),
        el("td", { class: "num mono", "data-label": "To hit", text: E.pct(g.prob) }), lockedCell(g), edgeCell(g),
        el("td", { class: "early-now" + mv.cls, "data-label": "DraftKings now", text: mv.text })]));
    });
    return table("Early lines still to kick off, game day first, then likeliest", heads, rows);
  }
  function resultChip(g) {
    const w = g.status !== "graded" ? "Awaiting the final" : g.result === "Win" ? "Won" : g.result === "Loss" ? "Lost" : g.result === "Push" ? "Push" : "Void";
    const cls = w === "Won" ? "badge-won" : w === "Lost" ? "badge-lost" : w === "Push" ? "badge-push" : w === "Void" ? "badge-void" : "badge-awaiting";
    return el("span", { class: "badge badge-state " + cls, text: w });
  }
  function gradedTable(list) {
    const heads = [{ t: "Game" }, { t: "Our side" }, { t: "DraftKings when locked", num: 1 }, { t: "Result" }, { t: "Units", num: 1 }, { t: "The line by the close", num: 1 }];
    return table("Early lines graded, newest first", heads, list.map(function (g) {
      const u = g.status === "graded" && num(g.units) ? g.units : null;
      return el("tr", { class: "early-row", "data-game": g.league + "|" + g.id, "data-result": g.result || "" }, [
        gameCell(g), sideCell(g), lockedCell(g),
        el("td", { "data-label": "Result" }, [resultChip(g), g.score ? el("span", { class: "early-sub", text: "Final " + g.away.abbr + " " + g.score.away + ", " + g.home.abbr + " " + g.score.home }) : null]),
        el("td", { class: "num mono" + (u > 0 ? " pos" : u < 0 ? " neg" : ""), "data-label": "Units", text: u == null ? "" : E.signed(u, 2) + "u" }),
        el("td", { class: "num", "data-label": "The line by the close", title: num(g.clv) ? "CLV " + pts(g.clv) + ": DraftKings' closing chance less what the locked price implied" : "" }, [num(g.move) ? el("span", { class: "mono", text: pts(g.move) }) : el("span", { class: "early-sub", text: g.status === "graded" ? "No close read" : "" }), num(g.move) ? el("span", { class: "early-sub", text: g.move > 0 ? "toward our side" : g.move < 0 ? "away from our side" : "unchanged" }) : null])]);
    }));
  }
  function more(host, n, label, on) { const b = el("button", { type: "button", class: "btn btn-secondary btn-sm", "data-more": label, text: "Show all " + n }); b.addEventListener("click", on); return el("div", { class: "more-row" }, [b]); }
  const state = { allUp: false, allDone: false };
  function render() {
    const sec = document.getElementById("early-sec"), host = document.getElementById("early-host"), link = document.querySelector('.subnav a[href="#early"]');
    if (!sec || !host) return;
    const D = data();
    sec.hidden = !D; if (link) link.hidden = !D;
    host.textContent = "";
    if (!D) return;
    const t = E.now(), all = (D.upcoming || []).concat(D.recent || []);
    const up = all.filter(g => g.status === "pending" && kick(g) > t).sort((a, b) => (E.dayKey({ commence: a.commence }) < E.dayKey({ commence: b.commence }) ? -1 : E.dayKey({ commence: a.commence }) > E.dayKey({ commence: b.commence }) ? 1 : 0) || b.prob - a.prob || kick(a) - kick(b));
    const done = all.filter(g => !(g.status === "pending" && kick(g) > t)).sort((a, b) => kick(b) - kick(a) || b.prob - a.prob);
    const R = D.record || {}, past = R.clears && R.clears.all, every = R.all && R.all.all;
    const parts = [recPart("Past their bar:", past), recPart("Every game:", every), every && every.clvN ? "CLV " + pts(every.clv / every.clvN) + " a game" : null].filter(Boolean);
    host.appendChild(el("p", { class: "early-record", id: "early-record", role: "status" }, parts.length ? [E.meta(parts)] : [up.length ? "Nothing graded yet: the first locked game kicks off " + E.startLabel(asPick(up.slice().sort((a, b) => kick(a) - kick(b))[0])) + "." : "Nothing graded yet."]));
    if (up.length) {
      host.appendChild(el("h3", { class: "early-h", text: "Locked and still to kick off (" + up.length + ")" }));
      host.appendChild(upcomingTable(state.allUp ? up : up.slice(0, CAP), up));
      if (!state.allUp && up.length > CAP) host.appendChild(more(host, up.length, "upcoming", function () { state.allUp = true; render(); }));
    }
    if (done.length) {
      host.appendChild(el("h3", { class: "early-h", text: "Graded" + (done.some(g => g.status !== "graded") ? " and awaiting a final" : "") }));
      host.appendChild(gradedTable(state.allDone ? done : done.slice(0, RCAP)));
      if (!state.allDone && done.length > RCAP) host.appendChild(more(host, done.length, "graded", function () { state.allDone = true; render(); }));
    }
    if (window.EdgeLineTeams && window.EdgeLineTeams.refresh) try { window.EdgeLineTeams.refresh(host); } catch (e) { /* logos are optional */ }
  }
  function init() { render(); setInterval(render, 60000); document.addEventListener("visibilitychange", function () { if (!document.hidden) render(); }); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  window.EdgeLineEarly = { render: render, data: data, state: state };
})();
