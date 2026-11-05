/* ==========================================================================
   EdgeLine AI — shared site script
   Theme toggle, nav state, odds helpers, and pick rendering.
   ========================================================================== */
(function () {
  "use strict";

  /* ---------- theme ---------- */
  const root = document.documentElement;
  function storedTheme() { try { return localStorage.getItem("theme"); } catch (e) { return null; } }
  function applyTheme(t) {
    if (t === "light" || t === "dark") root.setAttribute("data-theme", t);
    else root.removeAttribute("data-theme");
  }
  function currentTheme() {
    const explicit = root.getAttribute("data-theme");
    if (explicit) return explicit;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  applyTheme(storedTheme() || "dark"); /* space wants darkness: dark unless the visitor chose light */
  document.addEventListener("DOMContentLoaded", function () {
    /* mark active nav link; links with a hash point at a section, not a page */
    const here = location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll(".nav-links a").forEach(function (a) {
      const href = a.getAttribute("href") || "";
      if (href.indexOf("#") !== -1) return;
      if ((href || "index.html") === here) a.setAttribute("aria-current", "page");
    });
    const yr = document.querySelector("[data-year]");
    if (yr) yr.textContent = String(new Date().getFullYear());
    /* hide "Sample data" labels once the files come from the real pipeline */
    document.querySelectorAll("[data-sample-flag]").forEach(function (elm) {
      const which = elm.getAttribute("data-sample-flag");
      const d = which === "perf" ? window.PERF_DATA : which === "props" ? window.PROPS_DATA : which === "market" ? window.MARKET_DATA : window.PICKS_DATA;
      if (d && d.sample === false) elm.hidden = true;
    });
    initReveal();
    initTilt(document);
    const btn = document.querySelector(".theme-toggle");
    if (!btn) return;
    btn.addEventListener("click", function () {
      const next = currentTheme() === "dark" ? "light" : "dark";
      applyTheme(next);
      try { localStorage.setItem("theme", next); } catch (e) { /* ignore */ }
    });
  });

  /* ---------- motion: scroll reveal + pointer tilt (both skipped under reduced motion) ---------- */
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  function initReveal() {
    document.documentElement.classList.add("js");
    const targets = document.querySelectorAll("main .section > .container, main .section-tight > .container");
    if (reduceMotion || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
    targets.forEach(function (t) { t.classList.add("reveal"); io.observe(t); });
  }
  /* cards marked data-tilt lean toward the cursor; max 6 degrees */
  function initTilt(scope) {
    if (reduceMotion || !finePointer) return;
    scope.querySelectorAll("[data-tilt]:not([data-tilt-ready])").forEach(function (card) {
      card.setAttribute("data-tilt-ready", "");
      card.addEventListener("pointermove", function (e) {
        if (card.classList.contains("flipped")) return;
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
        card.style.setProperty("--rx", (-py * 6).toFixed(2) + "deg");
        card.style.setProperty("--ry", (px * 6).toFixed(2) + "deg");
        card.style.setProperty("--gx", ((px + 0.5) * 100).toFixed(1) + "%");
        card.style.setProperty("--gy", ((py + 0.5) * 100).toFixed(1) + "%");
        card.classList.add("tilting");
      });
      card.addEventListener("pointerleave", function () {
        card.classList.remove("tilting");
        card.style.removeProperty("--rx"); card.style.removeProperty("--ry");
      });
    });
  }

  /* ---------- odds helpers ---------- */
  function impliedProb(americanOdds) {
    const o = Number(americanOdds);
    return o < 0 ? (-o) / (-o + 100) : 100 / (o + 100);
  }
  function fmtOdds(o) { return (o > 0 ? "+" : "") + o; }
  function decimalOdds(o) { o = Number(o); return o > 0 ? 1 + o / 100 : 1 + 100 / -o; }
  function americanFromDecimal(dec) { return dec >= 2 ? Math.round((dec - 1) * 100) : -Math.round(100 / (dec - 1)); }
  function pct(p, digits) { return (p * 100).toFixed(digits == null ? 1 : digits) + "%"; }
  /* our probability for the side comes from the game model (modelProb); a market row without a model carries null */
  function hasModel(p) { return !!p && p.modelProb != null && Number.isFinite(Number(p.modelProb)); }
  /* edge = our probability − what the price implies; NaN when there is no model, so nothing downstream prints a number */
  function edgeOf(pick) { return hasModel(pick) ? Number(pick.modelProb) - impliedProb(pick.odds) : NaN; }
  /* sort keys that put a side with no model last */
  function probOf(p) { return hasModel(p) ? Number(p.modelProb) : -1; }
  function edgeNum(p) { const e = edgeOf(p); return Number.isFinite(e) ? e : -2; }
  function rowEdge(r) { return r && Number.isFinite(Number(r.edge)) && r.edge != null ? Number(r.edge) : -2; }
  /* the two numbers as text, never NaN */
  function probText(p) { return hasModel(p) ? pct(p.modelProb) : "—"; }
  function edgeText(p) { return hasModel(p) ? signed(edgeOf(p) * 100, 1) + "%" : "No model yet"; }
  /* a pick is usable only if its odds and model probability are real numbers; a market row may carry no model yet */
  function isValidPick(p) {
    const o = Number(p && p.odds), m = Number(p && p.modelProb);
    if (!(Number.isFinite(o) && o !== 0)) return false;
    if (p.isMarket && p.modelProb == null) return true;
    return Number.isFinite(m) && m >= 0 && m <= 1;
  }
  function signed(n, digits) {
    let v = Number(n).toFixed(digits == null ? 2 : digits);
    if (/^-0(\.0+)?$/.test(v)) v = v.slice(1); /* no "-0.0" */
    return (n > 0 ? "+" : "") + v;
  }

  /* ---------- DOM helpers (textContent only; data is untrusted) ---------- */
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (attrs[k] == null) return;
      if (k === "class") node.className = attrs[k];
      else if (k === "text") node.textContent = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) node.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return node;
  }
  /* team logos, matchups and faces live in js/teams.js, loaded after the data files; everything here degrades to text without it */
  function TM() { return window.EdgeLineTeams || null; }

  /* ---------- the bar: how far our probability must beat the price (the pipeline writes it into the market file) ---------- */
  const DEFAULT_BAR = 0.03, DEFAULT_WATCH = 0.015;
  function barOf() { const m = window.MARKET_DATA, t = m && Number(m.threshold); return Number.isFinite(t) && t > 0 ? t : DEFAULT_BAR; }
  function watchOf() { const m = window.MARKET_DATA, t = m && Number(m.watch); return Number.isFinite(t) && t > 0 ? t : DEFAULT_WATCH; }
  /* "3" or "1.5": a threshold in points, for copy */
  function ptsLabel(v) { return String(Math.round(v * 1000) / 10); }
  function barPts() { return ptsLabel(barOf()); }
  function watchPts() { return ptsLabel(watchOf()); }

  /* ---------- line shopping: every book's price on the pick's line ---------- */
  /* a book "clears the bar" when its price still leaves our probability the full edge the Lean tier needs */
  const BOOK_ABBR = { DraftKings: "DK", FanDuel: "FD", BetMGM: "MGM", Caesars: "CZR", BetRivers: "BR", Fanatics: "FAN", "ESPN BET": "ESPN", Bovada: "BOV", "BetOnline.ag": "BOL", Pinnacle: "PIN", LowVig: "LV", "Hard Rock Bet": "HRB", Bet365: "365", PointsBet: "PB", Unibet: "UNI" };
  function bookAbbr(name) { return BOOK_ABBR[name] || String(name || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase(); }
  function lineShop(p) {
    const ours = hasModel(p) ? Number(p.modelProb) : NaN, prices = (p && p.prices) || {}, BAR = barOf();
    const ladder = Object.keys(prices).map(function (b) {
      const price = Number(prices[b]);
      return { book: b, abbr: bookAbbr(b), price: price, implied: impliedProb(price), edge: ours - impliedProb(price) };
    }).filter(x => Number.isFinite(x.price) && x.price !== 0 && Number.isFinite(x.edge)).sort((a, b) => decimalOdds(b.price) - decimalOdds(a.price));
    const clears = ladder.filter(x => x.edge >= BAR).length, plus = ladder.filter(x => x.edge > 0).length;
    const best = ladder[0] || null, worst = ladder.length ? ladder[ladder.length - 1] : null;
    return { ladder: ladder, books: ladder.length, best: best, worst: worst, clears: clears, plus: plus, sole: ladder.length > 1 && clears === 1, costWorst: best && worst ? best.edge - worst.edge : 0, bar: BAR };
  }
  /* one sentence a bettor can act on */
  function shopSummary(p) {
    const s = lineShop(p), bar = barPts() + "-point bar";
    if (!s.books) return "";
    if (s.books === 1) return "Only " + s.best.book + " is priced on this line.";
    let t = "Best price " + fmtOdds(s.best.price) + " at " + s.best.book + ". ";
    t += "The worst, " + fmtOdds(s.worst.price) + " at " + s.worst.book + ", gives up " + (s.costWorst * 100).toFixed(1) + " points of edge. ";
    t += s.clears === s.books ? "Every one of the " + s.books + " books clears the " + bar + "." : s.clears === 1 ? "Only " + s.best.book + " clears the " + bar + "; the edge lives at one book." : s.clears + " of " + s.books + " books clear the " + bar + ".";
    return t;
  }
  /* chips for the card front: the top three prices, best first, and how many more books there are */
  function shopChips(p) {
    const s = lineShop(p);
    if (s.books < 2) return null;
    const row = el("div", { class: "pick-shop", "aria-label": "Line shopping" }, s.ladder.slice(0, 3).map(function (x, i) {
      return el("span", { class: "shop-chip" + (i === 0 ? " best" : "") + (x.edge >= s.bar ? " clears" : ""), title: x.book + " " + fmtOdds(x.price) + ", edge " + signed(x.edge * 100, 1) + "%" }, [el("span", { class: "shop-book", text: x.abbr }), el("span", { class: "mono", text: fmtOdds(x.price) })]);
    }));
    if (s.books > 3) row.appendChild(el("span", { class: "shop-more", text: "+" + (s.books - 3) + " more" }));
    if (s.sole) row.appendChild(el("span", { class: "badge badge-sole", text: "One book only" }));
    return row;
  }
  /* the full ladder for the breakdown dialog and the digest */
  function shopTable(p) {
    const s = lineShop(p);
    if (!s.books) return null;
    const rows = s.ladder.map(function (x, i) {
      const state = i === 0 ? "Best price" : x.edge >= s.bar ? "Clears the bar" : x.edge > 0 ? "Thin" : "No edge";
      return el("tr", { class: x.edge >= s.bar ? "shop-ok" : "shop-no" }, [
        el("td", {}, [el("strong", { text: x.book })]),
        el("td", { class: "num mono", text: fmtOdds(x.price) }),
        el("td", { class: "num mono", text: pct(x.implied) }),
        el("td", { class: "num mono", text: signed(x.edge * 100, 1) + "%" }),
        el("td", {}, [el("span", { class: "shop-state" + (i === 0 ? " best" : x.edge >= s.bar ? " ok" : ""), text: state })])
      ]);
    });
    return el("div", { class: "table-wrap shop-table", tabindex: "0", role: "region", "aria-label": "Prices by book" }, [el("table", { class: "data" }, [
      el("thead", {}, [el("tr", {}, ["Book", "Price", "Implied", "Edge", ""].map((h, i) => el("th", { scope: "col", class: i >= 1 && i <= 3 ? "num" : "", text: h })))]),
      el("tbody", {}, rows)
    ])]);
  }

  /* ---------- game day (owner rule, 2026-11-04): a play from tomorrow never sits above a play from today ---------- */
  const ET_ZONE = "America/New_York", DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const etDay = new Intl.DateTimeFormat("en-CA", { timeZone: ET_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
  const etDow = new Intl.DateTimeFormat("en-US", { timeZone: ET_ZONE, weekday: "short" });
  const dayKeyCache = {};
  function etKey(d) { return etDay.format(d); }
  function keyDate(key) { const p = String(key).split("-").map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2], 12)); }
  /* "Nov 6", or "Thu Nov 6" with the weekday (no comma) */
  function shortDate(d, withDow) { const md = d.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" }); return withDow ? d.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short" }) + " " + md : md; }
  function shiftKey(key, days) { const d = keyDate(key); d.setUTCDate(d.getUTCDate() + days); return etKey(d); }
  /* the date the start labels were written against: the data's generatedAt, else now */
  function labelBase() { const d = window.PICKS_DATA, m = window.MARKET_DATA; const t = Date.parse((d && d.generatedAt) || (m && m.generatedAt) || ""); return Number.isFinite(t) ? new Date(t) : new Date(); }
  /* the Eastern calendar date (YYYY-MM-DD) a pick or market row is played on, from its timestamp or, failing that, its start label; "" when it cannot be told */
  function dayKey(p) {
    if (!p) return "";
    const t = Date.parse(p.commence || "");
    if (Number.isFinite(t)) return dayKeyCache[p.commence] || (dayKeyCache[p.commence] = etKey(new Date(t)));
    const m = String(p.start || "").match(/^(Today|Tonight|Tomorrow|Sun|Mon|Tue|Wed|Thu|Fri|Sat)\b/i);
    if (!m) return "";
    const word = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase(), base = labelBase(), today = etKey(base);
    /* the pipeline labels same-day games Today/Tonight, so a bare weekday is always a later day (the same weekday means next week) */
    const offset = word === "Tomorrow" ? 1 : DOW.indexOf(word) === -1 ? 0 : ((DOW.indexOf(word) - DOW.indexOf(etDow.format(base)) + 7) % 7 || 7);
    return offset ? shiftKey(today, offset) : today;
  }
  /* earlier day first; an unknown day goes last */
  function keyCmp(ka, kb) { ka = ka || "~"; kb = kb || "~"; return ka < kb ? -1 : ka > kb ? 1 : 0; }
  function dayCmp(a, b) { return keyCmp(dayKey(a), dayKey(b)); }
  /* "Today", "Tomorrow" or "Thu Nov 6", relative to the current Eastern date */
  function dayLabel(key) {
    if (!key) return "Date to be confirmed";
    const today = etKey(new Date());
    if (key === today) return "Today";
    if (key === shiftKey(today, 1)) return "Tomorrow";
    return shortDate(keyDate(key), true);
  }
  /* the day heading in a ranked list, as children: "Tomorrow · Thu Nov 6", "Saturday · Nov 8" */
  function dayHeading(key) {
    const label = dayLabel(key);
    if (!key) return [el("span", { class: "day-when", text: label })];
    const near = label === "Today" || label === "Tomorrow", d = keyDate(key);
    const when = near ? label : d.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long" });
    const date = shortDate(d, near);
    return [el("span", { class: "day-when", text: when }), " ", el("span", { class: "day-date", text: date })];
  }
  /* the day boundary in a card grid or the digest slate */
  function dayDivider(key) { return el("p", { class: "day-divider" }, dayHeading(key)); }
  /* a meta line: parts as spans separated by a hairline (CSS .meta), never a middle dot */
  function meta(parts, cls) { return el("span", { class: "meta" + (cls ? " " + cls : "") }, (parts || []).filter(function (x) { return x != null && x !== ""; }).map(function (x) { return typeof x === "string" ? el("span", { text: x }) : el("span", {}, [x]); })); }

  /* ---------- the market board: every priced market from the last odds run, pick or not ---------- */
  function marketData() { const m = window.MARKET_DATA; return m && Array.isArray(m.rows) ? m : { sample: true, rows: [], threshold: DEFAULT_BAR, watch: DEFAULT_WATCH, games: 0, generatedAt: null }; }
  function statusLabel(st) { return st === "pick" ? "Pick" : st === "watch" ? "Watch" : "No bet"; }
  /* the status a row earns from its edge alone: watch from the watch line up, never a pick (that needs the board) */
  function rowStatus(r) { return hasModel(r) && rowEdge(r) >= watchOf() ? "watch" : "none"; }
  /* a market row dressed as a pick so the card, board and digest code can show it; never confused with a real pick */
  function marketAsPick(r, i, onBoard) {
    const modelled = hasModel(r) && r.edge != null && Number.isFinite(Number(r.edge));
    const edge = modelled ? Number(r.edge) : NaN, bar = barOf(), barLabel = barPts() + "-point bar", implied = pct(impliedProb(r.odds));
    /* a row is a pick only while that pick is on the current board; otherwise it is market information, whatever the file says */
    const status = onBoard ? "pick" : modelled ? rowStatus(r) : "none";
    const why = !modelled ? "No model yet: too little game data behind this one to price it, so there is no probability and no edge."
      : edge >= bar ? "Clears the " + barLabel + "."
      : edge > 0 ? "Edge of " + (edge * 100).toFixed(1) + " points sits under the " + barLabel + ": priced about right, not a bet."
      : "No edge: the price implies " + (-edge * 100).toFixed(1) + " points more than our probability.";
    const marketRef = typeof r.marketFair === "number" ? "For reference the market makes it " + pct(r.marketFair) + "." : "";
    const rationale = modelled
      ? "Our probability is " + pct(r.modelProb) + ", from the game data: results and margins this season, form, rest, the injury report and home edge. " + r.book + " offers " + fmtOdds(r.odds) + ", which implies " + implied + ". " + why + " Not graded against other books' prices." + (marketRef ? " " + marketRef : "")
      : why + " " + r.book + " offers " + fmtOdds(r.odds) + ", which implies " + implied + "." + (marketRef ? " " + marketRef : "");
    return { id: onBoard ? r.pickId : "m" + i, isMarket: !onBoard, status: status, sport: r.sport, league: r.league, sportKey: r.sportKey, event: r.event, home: r.home, away: r.away, commence: r.commence, start: r.start, marketKey: r.marketKey, market: r.market, outcome: r.outcome, pick: r.pick, odds: r.odds, book: r.book, prices: r.prices || {}, books: r.books, anchor: r.anchor, modelProb: modelled ? r.modelProb : null, ev: modelled ? r.ev : null,
      basis: "game", modelled: modelled, model: r.model || null, marketFair: typeof r.marketFair === "number" ? r.marketFair : null, marketEdge: typeof r.marketEdge === "number" ? r.marketEdge : null,
      confidence: onBoard ? "Lean" : statusLabel(status),
      rationale: rationale,
      factors: ["Best price " + fmtOdds(r.odds) + " at " + r.book, modelled ? "Probability " + pct(r.modelProb) + " from game data, not other books" : "No model yet: no probability from game data", modelled ? "Edge " + signed(edge * 100, 1) + " points over the price" : "No edge until the game has a model", typeof r.marketFair === "number" ? "Market reference " + pct(r.marketFair) : null].filter(Boolean), breakdown: null, context: null, movement: null };
  }
  /* the closest markets to the bar, best first, skipping the ones that are already picks on the board */
  function marketRows(opts) {
    opts = opts || {};
    const picksOnBoard = {}; ((window.PICKS_DATA || {}).picks || []).forEach(p => { picksOnBoard[p.id] = true; });
    let rows = marketData().rows.filter(r => !(r.pickId && picksOnBoard[r.pickId]) || opts.includePicks);
    if (opts.sport) rows = rows.filter(r => r.sport === opts.sport);
    if (opts.positive) rows = rows.filter(r => rowEdge(r) > 0);
    /* today first, then likeliest; a side with no model goes last (the file is by edge; byEdge keeps that for the nearest-miss slot) */
    if (!opts.byEdge) rows = rows.slice().sort((a, b) => dayCmp(a, b) || ((rowEdge(b) > 0) - (rowEdge(a) > 0)) || (probOf(b) - probOf(a)) || (rowEdge(b) - rowEdge(a)));
    else rows = rows.slice().sort((a, b) => rowEdge(b) - rowEdge(a));
    if (opts.oneSidePerMarket) { const seen = {}; rows = rows.filter(r => { const k = r.eventId + "|" + r.marketKey; if (seen[k]) return false; seen[k] = true; return true; }); }
    if (opts.oneRowPerGame) { const seen = {}; rows = rows.filter(r => { if (seen[r.eventId]) return false; seen[r.eventId] = true; return true; }); }
    return rows.slice(0, opts.limit || rows.length).map((r, i) => marketAsPick(r, i, !!(r.pickId && picksOnBoard[r.pickId])));
  }
  function marketSummary() {
    const m = marketData(), rows = m.rows || [];
    const watch = rows.filter(r => r.status === "watch").length, picks = rows.filter(r => r.status === "pick").length;
    const unmodelled = rows.filter(r => !hasModel(r)).length;
    const best = rows.filter(hasModel).sort((a, b) => rowEdge(b) - rowEdge(a))[0] || null;
    const when = m.generatedAt ? new Date(m.generatedAt) : null;
    return { games: m.games || 0, markets: rows.length, picks: picks, watch: watch, best: best, sports: m.sports || [], generatedAt: when && !isNaN(when) ? when : null, threshold: barOf(), watchEdge: watchOf(), barPts: barPts(), watchPts: watchPts(), modelled: Number.isFinite(Number(m.modelled)) ? Number(m.modelled) : null, unmodelled: unmodelled };
  }
  /* a divider row for the market table: where the sides priced against you begin */
  function marketDivider(text) {
    const tr = el("tr", { class: "mkt-divider" }, [el("td", { colspan: String(MARKET_COLS.length) }, [el("span", { text: text })])]);
    tr.firstChild.setAttribute("data-label", "");
    return tr;
  }
  /* a day heading row for the market table: where the next game day begins */
  function marketDayRow(key) {
    const tr = el("tr", { class: "day-divider" }, [el("td", { colspan: String(MARKET_COLS.length) }, dayHeading(key))]);
    tr.firstChild.setAttribute("data-label", "");
    return tr;
  }
  /* the full board as a table: every side of every main-line market, in the order given. opts.divider: the edge-tier label (within each day); opts.dayDivider: a heading row when the day changes; opts.spansDays: the full list spans more than one day even if this slice does not */
  const MARKET_COLS = ["Sport", "Game", "Market", "Side", "Best", "Book", "To hit", "Implied", "Edge", "Status"];
  function marketTable(rows, opts) {
    opts = opts || {};
    const onBoard = {}; ((window.PICKS_DATA || {}).picks || []).forEach(p => { onBoard[p.id] = true; });
    let divided = false, prevDay = null;
    /* headings only when the list spans more than one day; spansDays says so for a page that shows the list a slice at a time */
    const spansDays = !!opts.dayDivider && (!!opts.spansDays || new Set(rows.map(dayKey)).size > 1);
    const body = [];
    rows.forEach(function (r, idx) {
      const day = dayKey(r), newDay = idx === 0 || day !== prevDay;
      if (newDay) { if (spansDays) body.push(marketDayRow(day)); prevDay = day; divided = false; }
      if (opts.divider && !divided && !newDay && !(rowEdge(r) > 0) && rowEdge(rows[idx - 1]) > 0) { divided = true; body.push(marketDivider(opts.divider)); }
      const isPick = !!(r.pickId && onBoard[r.pickId]), modelled = hasModel(r);
      const st = isPick ? "pick" : rowStatus(r);
      r = Object.assign({}, r, { pickId: isPick ? r.pickId : null });
      const tr = el("tr", { class: "mkt-" + st + (modelled ? "" : " mkt-nomodel") }, [
        el("td", {}, [el("span", { class: "badge badge-sport", "data-sport": r.sport, text: r.sport })]),
        el("td", {}, [el("span", { class: "mkt-game" }, [TM() ? TM().matchup(r, { size: "sm", abbr: false }) : null, el("span", { class: "mkt-game-text" }, [el("span", { class: "mkt-event", text: r.event }), el("span", { class: "mkt-start", text: r.start || "" })])])]),
        el("td", { text: r.market }),
        el("td", {}, [el("strong", { text: r.pick })]),
        el("td", { class: "num mono", text: fmtOdds(r.odds) }),
        el("td", { text: r.book }),
        el("td", { class: "num mono", text: probText(r), title: modelled ? "Our probability, from the game data" + (typeof r.marketFair === "number" ? "; the market makes it " + pct(r.marketFair) + " (reference only)" : "") : "No model yet for this game" }),
        el("td", { class: "num mono", text: pct(impliedProb(r.odds)) }),
        modelled ? el("td", { class: "num mono " + (rowEdge(r) > 0 ? "edge-pos" : "edge-neg"), text: signed(r.edge * 100, 1) }) : el("td", { class: "num muted", text: "No model yet" }),
        el("td", {}, [r.pickId ? el("a", { class: "badge badge-status badge-pick", href: (opts.pickHref || "picks.html#") + r.pickId, text: "Pick" }) : el("span", { class: "badge badge-status badge-" + st, text: statusLabel(st) })])
      ]);
      /* phone layout restacks each row as a card and labels the cells from this attribute */
      Array.prototype.forEach.call(tr.children, function (td, i) { td.setAttribute("data-label", MARKET_COLS[i]); });
      body.push(tr);
    });
    const head = el("tr", {}, MARKET_COLS.map((h, i) => el("th", { scope: "col", class: i >= 4 && i <= 8 && i !== 5 ? "num" : "", text: h })));
    return el("div", { class: "table-wrap market-table", tabindex: "0", role: "region", "aria-label": "Market board" }, [el("table", { class: "data" }, [el("thead", {}, [head]), el("tbody", {}, body)])]);
  }
  /* a compact card for a slot that would otherwise be empty: what the market looks like right now */
  function pulseCard(opts) {
    opts = opts || {};
    const s = marketSummary();
    if (!s.markets) return el("div", { class: "card empty", text: opts.emptyText || "The market board fills at the next price refresh." });
    const top = marketRows({ limit: 3, oneSidePerMarket: true, positive: false });
    return el("article", { class: "card pulse", "data-tilt": "" }, [
      el("div", { class: "pick-head" }, [el("span", { class: "eyebrow", text: opts.title || "Market pulse" }), el("span", { class: "badge badge-strong", text: s.games + " games" })]),
      el("p", { class: "pulse-lede" }, [el("strong", { text: s.markets + " markets" }), " priced across " + s.sports.join(", ") + ", each side given our probability from the game data. " + (s.picks ? s.picks + " clear the " + s.barPts + "-point bar. " : "None clears the " + s.barPts + "-point bar" + (s.watch ? "; " + s.watch + " on watch, " + s.watchPts + " points or more over the price. " : ". ")) + (s.best ? "Closest: " + s.best.pick + " at " + fmtOdds(s.best.odds) + ", " + signed(s.best.edge * 100, 1) + " points." : "") + (s.unmodelled ? " " + s.unmodelled + (s.unmodelled === 1 ? " side has" : " sides have") + " no model yet." : "")]),
      el("ul", { class: "parlay-legs" }, top.map(function (p) { return el("li", {}, [el("span", { class: "leg-id" }, [TM() ? TM().matchup(p, { size: "sm", abbr: false }) : null, el("span", { class: "badge badge-sport", "data-sport": p.sport, text: p.sport })]), el("span", { class: "leg-pick" }, [el("strong", { text: p.pick }), el("span", { class: "leg-event", text: p.event + " · " + p.start })]), el("span", { class: "mono leg-price", text: fmtOdds(p.odds) }), el("span", { class: "badge badge-status badge-" + p.status, text: statusLabel(p.status) })]); })),
      el("div", { class: "pick-foot" }, [el("span", { text: s.generatedAt ? "Priced " + s.generatedAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "" }), el("a", { class: "flip-btn", href: "picks.html#market", text: "Open the market board" })])
    ]);
  }

  /* ---------- live status slot: js/live.js fills these once games start ---------- */
  function liveSlot(id) { return el("span", { class: "live-slot", "data-live": id }); }

  /* ---------- pick card ---------- */
  /* sample data files set sample:true; real data from scripts/update-data.js sets it false */
  function isSample() { const d = window.PICKS_DATA; return !d || d.sample !== false; }

  /* a pick card is two faces: numbers on the front, the "why" on the back; it flips in 3D */
  function pickCard(p, opts) {
    opts = opts || {};
    const modelled = hasModel(p), ours = modelled ? Number(p.modelProb) : 0, imp = impliedProb(p.odds);
    const confClass = p.isMarket ? "badge badge-status badge-" + (p.status || "none") : "badge badge-conf-" + String(p.confidence).toLowerCase();
    const factors = Array.isArray(p.factors) ? p.factors : [];
    const flipBtn = el("button", { type: "button", class: "flip-btn", "aria-expanded": "false", text: "Why this pick" });
    const backBtn = el("button", { type: "button", class: "flip-btn", text: "Back to numbers" });
    const front = el("div", { class: "pick-face pick-front" }, [
      el("div", { class: "pick-head" }, [
        el("span", { class: "pick-head-left" }, [rankChip(opts.rank), el("span", { class: "badge badge-sport", "data-sport": p.sport, text: p.sport })]),
        el("span", { class: "pick-head-right" }, [
          isSample() ? el("span", { class: "badge badge-sample", text: "Sample" }) : null,
          isPlayOfDay(p.id) ? el("span", { class: "badge badge-potd", text: "Play of the day" }) : null,
          el("span", { class: confClass, text: p.confidence })
        ])
      ]),
      el("div", {}, [
        TM() ? TM().matchup(p) : null,
        el("div", { class: "pick-event", text: p.event }),
        el("h3", { class: "pick-selection", text: p.pick }),
        meta([p.market, el("span", { class: "mono", text: fmtOdds(p.odds) }), p.book || null], "pick-market"),
        shopChips(p)
      ]),
      /* the probability bar: fill = our probability from the game data, tick = what the price implies, hairline = a coin flip */
      el("div", { class: "prob", role: "img", "aria-label": (modelled ? "Our probability " + pct(ours) + ", from the game data" : "No model yet for this game") + "; the price implies " + pct(imp), title: (modelled ? "To hit " + pct(ours) + " (ours, from the game data)" : "No model yet") + " · price implies " + pct(imp) + " · 50% line is a coin flip" }, [
        el("div", { class: "prob-bar" }, [el("span", { class: "prob-fill", style: "width:" + Math.max(0, Math.min(100, ours * 100)).toFixed(1) + "%" }), el("span", { class: "prob-tick", style: "left:" + Math.max(0, Math.min(100, imp * 100)).toFixed(1) + "%" })])
      ]),
      el("div", { class: "pick-metrics" }, [
        el("div", { class: "pick-metric lead", title: "Our probability for this side, from the game data; not other books' prices" }, [el("div", { class: "k", text: "To hit" }), el("div", { class: "v", text: probText(p) })]),
        el("div", { class: "pick-metric" }, [el("div", { class: "k", text: "Implied" }), el("div", { class: "v", text: pct(imp) })]),
        el("div", { class: "pick-metric" }, [el("div", { class: "k", text: "Edge" }), el("div", { class: modelled ? "v edge" : "v muted", text: edgeText(p) })])
      ]),
      el("div", { class: "pick-foot" }, [
        el("span", {}, [meta([p.league, p.start]), liveSlot(p.id)]),
        el("span", { class: "pick-actions" }, [p.isMarket ? null : parlayButton(p.id), flipBtn])
      ])
    ]);
    const back = el("div", { class: "pick-face pick-back", "aria-hidden": "true" }, [
      el("div", { class: "pick-head" }, [
        el("span", { class: "eyebrow", text: p.isMarket ? "Where the market sits" : "Why the model likes it" }),
        el("span", { class: confClass, text: p.confidence })
      ]),
      el("h3", { class: "pick-selection", text: p.pick }),
      el("p", { class: "pick-rationale", text: p.rationale }),
      factors.length ? el("ul", { class: "pick-factors" }, factors.map(function (f) { return el("li", { text: f }); })) : null,
      TM() ? TM().faces(p, { perTeam: 3, px: 40 }) : null,
      el("div", { class: "pick-foot" }, [
        p.isMarket ? el("a", { class: "flip-btn bd-btn", href: "picks.html#market", text: "Market board" }) : el("button", { type: "button", class: "flip-btn bd-btn", "data-breakdown": p.id, text: "Full breakdown" }),
        backBtn
      ])
    ]);
    const card = el("article", { class: "card pick" + (p.isMarket ? " market-card" : ""), "data-id": p.id, "data-sport": p.sport, "data-tilt": "" }, [
      el("div", { class: "pick-inner" }, [front, back])
    ]);
    if (TM()) TM().tint(card, p);
    function setFlipped(f) {
      card.classList.toggle("flipped", f);
      flipBtn.setAttribute("aria-expanded", String(f));
      back.setAttribute("aria-hidden", String(!f));
      front.setAttribute("aria-hidden", String(f));
      (f ? backBtn : flipBtn).focus({ preventScroll: true });
    }
    flipBtn.addEventListener("click", function () { setFlipped(true); });
    backBtn.addEventListener("click", function () { setFlipped(false); });
    return card;
  }

  /* count a number up to its final value; format(n) returns the display string */
  function animateNumber(node, to, format, ms) {
    if (reduceMotion || !window.requestAnimationFrame) { node.textContent = format(to); return; }
    const start = performance.now(), dur = ms || 900;
    function frame(now) {
      const t = Math.min(1, (now - start) / dur), eased = 1 - Math.pow(1 - t, 3);
      node.textContent = format(to * eased);
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function pickRow(p, i) {
    const edge = edgeOf(p);
    return el("tr", {}, [
      el("td", { class: "num rank-cell", text: String(i + 1) }),
      el("td", { text: p.sport }),
      el("td", {}, [el("span", { class: "mkt-game" }, [TM() ? TM().matchup(p, { size: "sm", abbr: false }) : null, el("span", { text: p.event })])]),
      el("td", { text: p.start }),
      el("td", { text: p.market }),
      el("td", {}, [el("strong", { text: p.pick })]),
      el("td", { class: "num", text: fmtOdds(p.odds) }),
      el("td", { class: "num", text: probText(p) }),
      el("td", { class: "num", text: pct(impliedProb(p.odds)) }),
      el("td", { class: "num", text: edgeText(p) }),
      el("td", {}, [el("span", { class: "badge badge-conf-" + String(p.confidence).toLowerCase(), text: p.confidence })]),
      el("td", { class: "num" }, [(function () { const s = lineShop(p); return s.books ? el("span", { class: "mono" + (s.sole ? " shop-sole" : ""), title: shopSummary(p), text: s.clears + "/" + s.books }) : el("span", { text: "—" }); })()]),
      el("td", {}, [parlayButton(p.id)])
    ]);
  }

  function picksTable(picks) {
    const head = el("tr", {}, ["#", "Sport", "Event", "Start", "Market", "Pick", "Odds", "To hit", "Implied", "Edge", "Confidence", "Books", "Parlay"]
      .map(function (h, i) { return el("th", { scope: "col", class: (i >= 6 && i <= 9) || i === 11 || i === 0 ? "num" : "", title: i === 0 ? "Rank by our probability from game data, likeliest first" : i === 7 ? "Our probability for the side, from the game data" : i === 11 ? "Books that still clear the " + barPts() + "-point bar, out of every book priced on this line" : null, text: h }); }));
    const tbody = el("tbody", {}, picks.map(pickRow));
    return el("div", { class: "table-wrap", tabindex: "0", role: "region", "aria-label": "Picks table" }, [el("table", { class: "data" }, [el("thead", {}, [head]), tbody])]);
  }

  function sortByEdge(picks) {
    return (picks || []).filter(isValidPick).sort(function (a, b) { return edgeNum(b) - edgeNum(a); });
  }
  /* the site's order (owner rule): today's games before tomorrow's; within a day, sides with a positive edge first, then everything else; within each tier the likeliest to hit first, by our probability from the game data; edge breaks ties; a side with no model goes last */
  function worthFirst(a, b) { return dayCmp(a, b) || ((edgeNum(b) > 0) - (edgeNum(a) > 0)) || (probOf(b) - probOf(a)) || (edgeNum(b) - edgeNum(a)); }
  function sortByProb(picks) {
    return (picks || []).filter(isValidPick).sort(worthFirst);
  }
  /* the rank chip: "#1 · Likeliest" on the top card, "#n" below it */
  function rankChip(n, short) {
    if (!n) return null;
    return el("span", { class: "rank" + (n === 1 ? " rank-top" : ""), title: n === 1 ? "Likeliest to hit on this board, by our probability from game data" : "Rank " + n + " by our probability from game data", text: n === 1 && !short ? "#1 Likeliest" : "#" + n });
  }

  /* ---------- play of the day ---------- */
  function isPlayOfDay(id) { const d = window.PICKS_DATA; return !!(d && d.playOfDay && d.playOfDay.id === id); }
  function potdCard(p) {
    if (!p) {
      /* nothing cleared the bar: show the closest market instead, labelled as such */
      const alt = marketRows({ limit: 1, oneSidePerMarket: true, byEdge: true })[0];
      if (alt) { const c = potdCard(Object.assign({}, alt, { _eyebrow: "Closest to the bar", _note: "No pick clears the " + barPts() + "-point bar yet, so this is the nearest miss on our numbers, not a play. It becomes the play of the day at the first refresh that finds an edge." })); c.classList.add("potd-market"); return c; }
      return el("div", { class: "card empty", text: "No play of the day yet. It is chosen at the first refresh with picks, around noon ET." });
    }
    const modelled = hasModel(p);
    const status = p.result ? "Result: " + p.result : p.started ? "Started" : p.start;
    const card = el("article", { class: "card potd", "data-sport": p.sport, "data-tilt": "" }, [
      el("div", { class: "pick-head" }, [
        el("span", { class: "eyebrow", text: p._eyebrow || "Play of the day" }),
        el("span", { class: "pick-head-right" }, [p.isMarket ? el("span", { class: "badge badge-status badge-" + p.status, text: statusLabel(p.status) }) : null, el("span", { class: "badge badge-sport", "data-sport": p.sport, text: p.sport })])
      ]),
      TM() ? TM().matchup(p, { size: "lg" }) : null,
      el("div", { class: "potd-event", text: p.event }),
      el("h3", { class: "potd-selection", text: p.pick }),
      meta([p.market, el("span", { class: "mono", text: fmtOdds(p.odds) }), p.book || null], "potd-line"),
      el("div", { class: "pick-metrics potd-metrics" }, [
        el("div", { class: "pick-metric", title: "Our probability for this side, from the game data; not other books' prices" }, [el("div", { class: "k", text: "To hit" }), el("div", { class: "v", text: probText(p) })]),
        el("div", { class: "pick-metric" }, [el("div", { class: "k", text: "Edge" }), el("div", { class: modelled ? "v edge" : "v muted", text: edgeText(p) })]),
        el("div", { class: "pick-metric" }, [el("div", { class: "k", text: "EV / unit" }), el("div", { class: modelled ? "v edge" : "v muted", text: modelled ? signed((p.ev == null ? p.modelProb * decimalOdds(p.odds) - 1 : p.ev) * 100, 1) + "%" : "—" })])
      ]),
      el("p", { class: "pick-rationale", text: p._note || p.rationale }),
      el("div", { class: "pick-foot" }, [
        el("span", { class: p.result ? "result result-" + p.result.toLowerCase() : "" }, [status, p.result || p.isMarket ? null : liveSlot(p.id)]),
        el("span", { class: "pick-actions" }, [p.started || p.isMarket ? null : parlayButton(p.id), p.isMarket ? el("a", { class: "flip-btn", href: "picks.html#market", text: "Market board" }) : el("button", { type: "button", class: "flip-btn", "data-breakdown": p.id, text: "Full breakdown" })])
      ])
    ]);
    if (TM()) TM().tint(card, p);
    return card;
  }

  /* ---------- parlays ---------- */
  /* combined numbers for a set of picks at one book (or the best single book, or mixed best prices) */
  function parlayMath(legs, book) {
    const common = legs.length ? Object.keys(legs[0].prices || {}).filter(b => legs.every(l => l.prices && l.prices[b] != null)) : [];
    let chosen = book && common.indexOf(book) !== -1 ? book : null, mixed = false;
    if (!chosen && common.length) chosen = common.slice().sort((a, b) => legs.reduce((d, l) => d * decimalOdds(l.prices[b]), 1) - legs.reduce((d, l) => d * decimalOdds(l.prices[a]), 1))[0];
    if (!chosen) mixed = true;
    const priced = legs.map(l => ({ pick: l, price: mixed ? l.odds : l.prices[chosen] }));
    const dec = priced.reduce((d, x) => d * decimalOdds(x.price), 1), fair = legs.reduce((f, l) => f * Number(l.modelProb), 1);
    return { book: mixed ? "Best prices (mixed books)" : chosen, books: common, mixed: mixed, legs: priced, decimal: dec, odds: legs.length ? americanFromDecimal(dec) : 0, fairProb: fair, implied: legs.length ? 1 / dec : 0, edge: legs.length ? fair - 1 / dec : 0, ev: legs.length ? fair * dec - 1 : 0 };
  }
  /* every +EV parlay on the board, best book per leg set, earliest game day first then likeliest. opts: size (2|3|4|null), limit, maxLegs */
  function bestParlays(picks, opts) {
    opts = opts || {};
    const maxLegs = opts.size || opts.maxLegs || 4, minLegs = opts.size || 2, limit = opts.limit || 5;
    const legsAll = (picks || []).filter(p => p.prices && Object.keys(p.prices).length && Number.isFinite(Number(p.modelProb)));
    const books = {}; legsAll.forEach(p => Object.keys(p.prices).forEach(b => { books[b] = true; }));
    const bySet = {};
    Object.keys(books).forEach(function (book) {
      const legs = legsAll.filter(p => p.prices[book] != null && impliedProb(p.prices[book]) <= Number(p.modelProb));
      function consider(combo) {
        if (new Set(combo.map(p => p.event)).size !== combo.length) return;
        const dec = combo.reduce((d, p) => d * decimalOdds(p.prices[book]), 1), fair = combo.reduce((f, p) => f * Number(p.modelProb), 1), ev = fair * dec - 1;
        if (ev <= 0) return;
        const key = combo.map(p => p.id).sort().join("|");
        if (!bySet[key] || ev > bySet[key].ev) bySet[key] = { book: book, day: combo.map(dayKey).sort(keyCmp)[0] || "", legs: combo.map(p => ({ id: p.id, pick: p.pick, event: p.event, sport: p.sport, price: p.prices[book] })), decimal: dec, odds: americanFromDecimal(dec), fairProb: fair, ev: ev };
      }
      const n = legs.length;
      function rec(start, combo) {
        if (combo.length >= minLegs) consider(combo);
        if (combo.length === maxLegs) return;
        for (let i = start; i < n; i++) rec(i + 1, combo.concat([legs[i]]));
      }
      rec(0, []);
    });
    /* the day of the ticket's earliest leg first, then the likeliest ticket, then expected value */
    return Object.values(bySet).sort((a, b) => keyCmp(a.day, b.day) || (b.fairProb - a.fairProb) || (b.ev - a.ev)).slice(0, limit);
  }

  /* the slip: pick ids kept in localStorage; buttons everywhere reflect it */
  const SLIP_KEY = "parlay-slip";
  const slip = {
    get: function () { try { return JSON.parse(localStorage.getItem(SLIP_KEY) || "[]"); } catch (e) { return []; } },
    set: function (ids) { try { localStorage.setItem(SLIP_KEY, JSON.stringify(ids)); } catch (e) { /* ignore */ } syncButtons(); document.dispatchEvent(new CustomEvent("slipchange", { detail: ids })); },
    has: function (id) { return slip.get().indexOf(id) !== -1; },
    toggle: function (id) { const ids = slip.get(); const i = ids.indexOf(id); if (i === -1) ids.push(id); else ids.splice(i, 1); slip.set(ids); },
    clear: function () { slip.set([]); }
  };
  function parlayButton(id) {
    const on = slip.has(id);
    return el("button", { type: "button", class: "add-parlay", "data-id": id, "aria-pressed": String(on), text: on ? "In parlay" : "Add to parlay" });
  }
  function syncButtons() {
    const ids = slip.get();
    document.querySelectorAll(".add-parlay[data-id]").forEach(function (b) { const on = ids.indexOf(b.getAttribute("data-id")) !== -1; b.setAttribute("aria-pressed", String(on)); b.textContent = on ? "In parlay" : "Add to parlay"; });
    const link = document.querySelector(".slip-link");
    if (link) { link.hidden = !ids.length; const n = link.querySelector("strong"); if (n) n.textContent = String(ids.length); }
  }
  document.addEventListener("click", function (e) {
    const b = e.target.closest && e.target.closest(".add-parlay[data-id]");
    if (b) slip.toggle(b.getAttribute("data-id"));
  });
  document.addEventListener("DOMContentLoaded", syncButtons);

  function parlayCard(par, opts) {
    opts = opts || {};
    if (!par) return pulseCard({ title: "No parlay yet: the market right now", emptyText: "No parlay of the day yet. It needs two or more picks from different games that are all worth a bet at the same book." });
    const status = par.result ? "Result: " + par.result : par.legs.some(l => l.started) ? "In progress" : "All legs ahead";
    return el("article", { class: "card parlay", "data-tilt": "" }, [
      el("div", { class: "pick-head" }, [
        el("span", { class: "eyebrow", text: opts.title || "Parlay of the day" }),
        el("span", { class: "pick-head-right" }, [opts.tag ? el("span", { class: "badge badge-potd", text: opts.tag }) : null, el("span", { class: "badge badge-strong", text: par.legs.length + " legs" })])
      ]),
      el("ul", { class: "parlay-legs" }, par.legs.map(function (l) {
        return el("li", {}, [
          el("span", { class: "leg-id" }, [TM() ? TM().matchup(l, { size: "sm", abbr: false }) : null, el("span", { class: "badge badge-sport", "data-sport": l.sport, text: l.sport })]),
          el("span", { class: "leg-pick" }, [el("strong", { text: l.pick }), el("span", { class: "leg-event", text: l.event }), l.result ? null : liveSlot(l.id)]),
          el("span", { class: "mono leg-price", text: fmtOdds(l.price) }),
          l.result ? el("span", { class: "result result-" + l.result.toLowerCase(), text: l.result }) : null
        ]);
      })),
      el("div", { class: "pick-metrics potd-metrics" }, [
        el("div", { class: "pick-metric" }, [el("div", { class: "k", text: "Combined" }), el("div", { class: "v", text: fmtOdds(par.odds) })]),
        el("div", { class: "pick-metric", title: "The legs' probabilities from the game data, multiplied" }, [el("div", { class: "k", text: "To hit" }), el("div", { class: "v", text: pct(par.fairProb) })]),
        el("div", { class: "pick-metric" }, [el("div", { class: "k", text: "EV / unit" }), el("div", { class: "v edge", text: signed(par.ev * 100, 1) + "%" })])
      ]),
      el("p", { class: "pick-rationale", text: "Priced as one ticket at " + par.book + ". Legs are from different games and treated as independent, each at our probability from the game data; one loss loses the ticket, a push drops out." }),
      el("div", { class: "pick-foot" }, [
        el("span", { class: par.result ? "result result-" + par.result.toLowerCase() : "", text: status }),
        el("span", { class: "pick-actions" }, [
          el("button", { type: "button", class: "flip-btn", "data-breakdown": par.legs.map(l => l.id).join(","), text: "Leg breakdowns" }),
          opts.loadButton ? el("button", { type: "button", class: "flip-btn", "data-load-parlay": "", text: "Load into the builder" }) : el("a", { class: "flip-btn", href: "picks.html#parlays", text: "See all the best parlays" })
        ])
      ])
    ]);
  }

  /* ---------- full breakdown dialog ---------- */
  function findPick(id) {
    const d = window.PICKS_DATA; if (!d) return null;
    return (d.picks || []).find(p => p.id === id) || (d.playOfDay && d.playOfDay.id === id ? d.playOfDay : null);
  }
  function statusClass(st) { return /^(out|injured|ir|doubtful|suspended)/i.test(st) ? "inj-out" : /^(questionable|day|probable|game)/i.test(st) ? "inj-q" : ""; }
  /* the rule every grade follows, stated once at the top of the dialog */
  const GRADE_RULE = "Graded on game data: results, form, rest, injuries, home edge. Not graded against other books' prices.";
  /* one meta line under the pick's title: what the game model projects, how much data is behind it, and the market's number for reference */
  function modelLine(p) {
    const m = p.model;
    if (p.basis === "price") return meta(["Logged before the game model: graded on the price edge, kept as a separate record"], "bd-model");
    if (!m) return null;
    const parts = [];
    if (p.marketKey === "totals" && typeof m.total === "number") parts.push("Projected total " + m.total);
    else if (typeof m.margin === "number") {
      /* the margin is home minus away; say it from the picked side when we can tell which one that is */
      const side = TM() ? TM().side(p) : null, away = side === "away" && p.away;
      parts.push("Projected margin " + signed(away ? -m.margin : m.margin, 1) + " for " + (away ? p.away : p.home || "the home side"));
    }
    else if (typeof m.total === "number") parts.push("Projected total " + m.total);
    if (typeof m.gp === "number") parts.push(m.gp + (m.gp === 1 ? " game" : " games") + " behind it" + (m.thin ? ", a thin sample" : ""));
    if (typeof p.marketFair === "number") parts.push("Market reference " + pct(p.marketFair));
    return parts.length ? meta(parts, "bd-model") : null;
  }
  function breakdownSection(p) {
    const b = p.breakdown, c = p.context || {};
    const sec = el("section", { class: "bd-pick" }, [
      el("div", { class: "bd-head" }, [
        el("div", {}, [
          el("div", { class: "bd-id" }, [TM() ? TM().matchup(p) : null, el("span", { class: "badge badge-sport", "data-sport": p.sport, text: p.sport })]),
          el("h3", { class: "bd-title", text: p.pick }),
          meta([p.event, p.market, fmtOdds(p.odds) + (p.book ? " at " + p.book : ""), p.start], "bd-sub"),
          modelLine(p)
        ]),
        el("span", { class: "badge badge-conf-" + String(p.confidence).toLowerCase() + " bd-tier", text: p.confidence })
      ])
    ]);
    if (!b) { sec.appendChild(el("p", { class: "muted", text: "No breakdown for this pick yet. It is written at the next data refresh." })); return sec; }
    const list = (title, items, cls) => items && items.length ? el("div", { class: "bd-block" }, [el("h4", { text: title }), el("ul", { class: "bd-list " + cls }, items.map(t => el("li", { text: t })))]) : null;
    sec.appendChild(el("div", { class: "bd-block" }, [el("h4", { text: "Why " + b.tier }), el("p", { text: b.tierWhy })]));
    sec.appendChild(el("div", { class: "bd-block" }, [el("h4", { text: "The number" }), el("p", { text: b.price })]));
    [list("What supports it", b.support, "bd-support"), list("What could go wrong", b.risks, "bd-risk"), list("Also worth knowing", b.notes, "bd-note")].forEach(function (n) { if (n) sec.appendChild(n); });
    sec.appendChild(el("p", { class: "bd-verdict", text: b.verdict }));
    /* raw context */
    const grid = el("div", { class: "bd-grid" });
    const teams = Object.keys(c.injuries || {});
    if (teams.length) grid.appendChild(el("div", { class: "bd-cell bd-wide" }, [el("h4", { text: "Injury report" })].concat(teams.map(function (t) {
      const items = c.injuries[t] || [];
      return el("div", { class: "bd-team" }, [el("strong", { text: t }), items.length ? el("ul", { class: "bd-inj" }, items.map(i => el("li", {}, [TM() && (i.athleteId || i.headshot) ? TM().face(p.sportKey, { id: i.athleteId, name: i.name, headshot: i.headshot }, 28) : null, el("span", { class: "inj-status " + statusClass(i.status), text: i.status }), " " + i.name + (i.pos ? " (" + i.pos + ")" : "") + (i.type ? " · " + i.type : "") + (i.returnDate ? " · back " + i.returnDate : ""), i.note ? el("span", { class: "inj-note", text: i.note }) : null]))) : el("p", { class: "small muted", text: "No one listed." })]);
    }))));
    const known = TM() ? TM().faces(p, { perTeam: 4, px: 48, title: false }) : null;
    if (known) grid.appendChild(el("div", { class: "bd-cell bd-wide" }, [el("h4", { text: "Names to know" }), known]));
    if (c.weather) grid.appendChild(el("div", { class: "bd-cell" }, [el("h4", { text: "Weather" }), el("p", { text: [c.weather.summary, c.weather.tempF != null ? c.weather.tempF + "°F" : null, c.weather.windMph != null ? "wind " + c.weather.windMph + " mph" : null, c.weather.precipPct != null ? c.weather.precipPct + "% rain" : null].filter(Boolean).join(" · ") + (c.weather.city ? " · " + c.weather.city : "") })]));
    else if (c.indoor) grid.appendChild(el("div", { class: "bd-cell" }, [el("h4", { text: "Weather" }), el("p", { text: "Indoor venue." })]));
    const restTeams = Object.keys(c.rest || {}).filter(t => c.rest[t]);
    if (restTeams.length) grid.appendChild(el("div", { class: "bd-cell" }, [el("h4", { text: "Rest" })].concat(restTeams.map(t => el("p", { text: t + ": " + (c.rest[t].b2b ? "back-to-back" : c.rest[t].restDays + " days' rest") + ", " + c.rest[t].gamesLast7 + " games in 7 days" })))));
    const recTeams = Object.keys(c.records || {}).filter(t => c.records[t] && c.records[t].overall);
    if (recTeams.length) grid.appendChild(el("div", { class: "bd-cell" }, [el("h4", { text: "Records" })].concat(recTeams.map(t => el("p", { text: t + ": " + c.records[t].overall + (c.records[t].home ? " · home " + c.records[t].home : "") + (c.records[t].away ? " · road " + c.records[t].away : "") })))));
    if (c.probables && Object.keys(c.probables).length) grid.appendChild(el("div", { class: "bd-cell" }, [el("h4", { text: "Probable pitchers" })].concat(Object.keys(c.probables).map(t => el("p", { text: t + ": " + c.probables[t] })))));
    if (p.movement || p.dk) grid.appendChild(el("div", { class: "bd-cell" }, [el("h4", { text: "Line movement" }),
      p.movement ? el("p", { text: "Logged " + fmtOdds(p.movement.loggedOdds) + (typeof p.movement.loggedFair === "number" ? " (our probability " + pct(p.movement.loggedFair) + ")" : "") + ". Now " + fmtOdds(p.movement.currentOdds) + " at " + p.movement.currentBook + " (" + [typeof p.movement.currentFair === "number" ? "market " + pct(p.movement.currentFair) : null, typeof p.movement.currentEdge === "number" ? "our edge " + signed(p.movement.currentEdge * 100, 1) + "%" : null].filter(Boolean).join(", ") + ")." }) : null,
      p.mkt ? el("p", { class: "bd-dk bd-mkt" }, [el("span", { class: "dk-dir dk-" + (p.mkt.moved || "flat"), text: p.mkt.moved === "toward" ? "▲ toward" : p.mkt.moved === "away" ? "▼ against" : "● flat" }), " " + p.mkt.label + "." + (p.sgoHistory && p.sgoHistory.length > 1 ? " " + p.sgoHistory.length + " moves tracked." : "")]) : null,
      p.dk ? el("p", { class: "bd-dk" }, [el("span", { class: "dk-dir dk-" + (p.dk.moved || "flat"), text: p.dk.moved === "toward" ? "▲ toward" : p.dk.moved === "away" ? "▼ against" : "● flat" }), " " + p.dk.label + "." + (p.dkHistory && p.dkHistory.length > 1 ? " " + p.dkHistory.length + " moves tracked." : "")]) : null,
      el("p", { class: "small muted", text: "The market's moves are shown for reference; they take no part in the grade. Closing line value is a market measure, scored after the game against the closing number: evidence about the price, not the grade. See Performance." })]));
    const shop = shopTable(p);
    if (shop) grid.appendChild(el("div", { class: "bd-cell bd-wide" }, [el("h4", { text: "Line shopping" }), el("p", { text: shopSummary(p) }), shop, lineShop(p).sole ? el("p", { class: "shop-warn", text: "When one book is alone on a price it is often the one that is wrong, and it can be limited or pulled quickly. Treat a sole-book edge as thinner than the number." }) : null]));
    if (c.venue || c.broadcast) grid.appendChild(el("div", { class: "bd-cell" }, [el("h4", { text: "Where" }), el("p", { text: [c.venue, c.broadcast ? "TV: " + c.broadcast : null].filter(Boolean).join(" · ") })]));
    if (grid.children.length) sec.appendChild(grid);
    return sec;
  }
  function openBreakdown(ids) {
    let dlg = document.getElementById("bd");
    if (!dlg) {
      dlg = el("dialog", { id: "bd", class: "bd", "aria-label": "Full breakdown" }, [
        el("div", { class: "bd-top" }, [el("span", { class: "eyebrow", text: "Full breakdown" }), el("button", { type: "button", class: "btn btn-secondary btn-sm", "data-bd-close": "", text: "Close" })]),
        el("div", { class: "bd-body" })
      ]);
      dlg.addEventListener("click", function (e) { if (e.target === dlg || e.target.closest("[data-bd-close]")) dlg.close(); });
      document.body.appendChild(dlg);
    }
    const body = dlg.querySelector(".bd-body"); body.textContent = "";
    const picks = ids.map(findPick).filter(Boolean);
    body.appendChild(el("p", { class: "bd-rule", text: GRADE_RULE }));
    if (!picks.length) body.appendChild(el("p", { class: "muted", text: "That pick is no longer on the board." }));
    picks.forEach(p => body.appendChild(breakdownSection(p)));
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
    body.scrollTop = 0;
  }
  document.addEventListener("click", function (e) {
    const b = e.target.closest && e.target.closest("[data-breakdown]");
    if (b) openBreakdown(b.getAttribute("data-breakdown").split(","));
  });

  /* ---------- profit calendar: a month grid of daily units ---------- */
  function pnlCalendar(container, byDate, opts) {
    opts = opts || {};
    const map = {}; (byDate || []).forEach(d => { map[d.date] = d; });
    const dates = Object.keys(map).sort();
    const latest = dates.length ? dates[dates.length - 1] : new Date().toISOString().slice(0, 10);
    let year = Number(latest.slice(0, 4)), month = Number(latest.slice(5, 7)) - 1;
    const maxAbs = Math.max(1, dates.reduce((m, d) => Math.max(m, Math.abs(map[d].units)), 0));
    const head = el("div", { class: "cal-head" }, [
      el("button", { type: "button", class: "btn btn-secondary btn-sm", "data-cal": "-1", "aria-label": "Previous month", text: "‹" }),
      el("h3", { class: "cal-title", "aria-live": "polite" }),
      el("button", { type: "button", class: "btn btn-secondary btn-sm", "data-cal": "1", "aria-label": "Next month", text: "›" })
    ]);
    const table = el("table", { class: "cal" }), summary = el("p", { class: "cal-summary" });
    container.appendChild(head); container.appendChild(table); container.appendChild(summary);
    function render() {
      table.textContent = "";
      const first = new Date(Date.UTC(year, month, 1)), label = first.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
      head.querySelector(".cal-title").textContent = label;
      table.appendChild(el("thead", {}, [el("tr", {}, ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => el("th", { scope: "col", text: d })))]));
      const body = el("tbody"); let row = el("tr"); const pad = first.getUTCDay();
      for (let i = 0; i < pad; i++) row.appendChild(el("td", { class: "cal-pad" }));
      const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      let mUnits = 0, mW = 0, mL = 0, mP = 0, active = 0;
      for (let d = 1; d <= days; d++) {
        const key = year + "-" + String(month + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0"), rec = map[key];
        const cell = el("td", { class: "cal-day" + (rec ? (rec.units > 0 ? " pos" : rec.units < 0 ? " neg" : " flat") : "") }, [
          el("span", { class: "cal-num", text: String(d) }),
          rec ? el("span", { class: "cal-units mono", text: signed(rec.units, 2) + "u" }) : null,
          rec ? el("span", { class: "cal-rec", text: rec.wins + "-" + rec.losses + (rec.pushes ? "-" + rec.pushes : "") }) : null
        ]);
        if (rec) { cell.style.setProperty("--heat", String(Math.min(1, 0.25 + Math.abs(rec.units) / maxAbs * 0.75))); mUnits += rec.units; mW += rec.wins; mL += rec.losses; mP += rec.pushes; active++; cell.setAttribute("title", key + ": " + signed(rec.units, 2) + " units, " + rec.wins + "-" + rec.losses + "-" + rec.pushes); }
        row.appendChild(cell);
        if ((pad + d) % 7 === 0) { body.appendChild(row); row = el("tr"); }
      }
      if (row.children.length) { while (row.children.length < 7) row.appendChild(el("td", { class: "cal-pad" })); body.appendChild(row); }
      table.appendChild(body);
      summary.textContent = active ? label + ": " + signed(Math.round(mUnits * 100) / 100, 2) + " units over " + active + " days, " + mW + "-" + mL + (mP ? "-" + mP : "") + "." : "No graded picks in " + label + ".";
    }
    head.addEventListener("click", function (e) { const b = e.target.closest("[data-cal]"); if (!b) return; month += Number(b.getAttribute("data-cal")); if (month < 0) { month = 11; year--; } if (month > 11) { month = 0; year++; } render(); });
    render();
    return { render: render, update: function (rows) { Object.keys(map).forEach(k => delete map[k]); (rows || []).forEach(d => { map[d.date] = d; }); render(); } };
  }

  window.EdgeLine = {
    impliedProb: impliedProb, fmtOdds: fmtOdds, pct: pct, edgeOf: edgeOf, signed: signed, isValidPick: isValidPick, decimalOdds: decimalOdds, americanFromDecimal: americanFromDecimal,
    hasModel: hasModel, probOf: probOf, edgeNum: edgeNum, rowEdge: rowEdge, probText: probText, edgeText: edgeText, barOf: barOf, watchOf: watchOf, barPts: barPts, watchPts: watchPts, gradeRule: GRADE_RULE,
    el: el, meta: meta, pickCard: pickCard, picksTable: picksTable, sortByEdge: sortByEdge, sortByProb: sortByProb, worthFirst: worthFirst, dayKey: dayKey, dayLabel: dayLabel, dayCmp: dayCmp, dayDivider: dayDivider, rankChip: rankChip, initTilt: initTilt, animateNumber: animateNumber,
    potdCard: potdCard, parlayCard: parlayCard, parlayMath: parlayMath, bestParlays: bestParlays, slip: slip, parlayButton: parlayButton, pnlCalendar: pnlCalendar, openBreakdown: openBreakdown,
    lineShop: lineShop, shopSummary: shopSummary, shopChips: shopChips, shopTable: shopTable, bookAbbr: bookAbbr, liveSlot: liveSlot,
    marketData: marketData, marketRows: marketRows, marketSummary: marketSummary, marketTable: marketTable, pulseCard: pulseCard, statusLabel: statusLabel
  };
})();
