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
    /* the wording switch and the replay note (data/replay.js) */
    applyCall(document);
    replayNotes(document);
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

  /* ---------- leans, not picks (owner decision, 2026-11-05) ----------
     A held-out replay priced the game model's selections at the closing odds over past seasons and they lost money in
     every league, so the pages, the digest and the feeds call them "leans" until the live record beats the close.
     THE ONE SWITCH is `call` in data/replay.js: "leans" (the default, also when the file is missing) or "picks", which
     restores the old wording everywhere. Generated copy asks word(); static copy carries the lean wording with the
     pick wording beside it in data-pick, swapped in by applyCall. File names, ids, fields and anchors never change. */
  const CALL_WORDS = {
    leans: { one: "lean", many: "leans", One: "Lean", Many: "Leans", ofDay: "Lean of the day", parlayOfDay: "Parlay lean of the day" },
    picks: { one: "pick", many: "picks", One: "Pick", Many: "Picks", ofDay: "Play of the day", parlayOfDay: "Parlay of the day" }
  };
  function callName() { const r = window.REPLAY_DATA; return r && r.call === "picks" ? "picks" : "leans"; }
  function word(k) { const w = CALL_WORDS[callName()]; return w[k] != null ? w[k] : k; }
  /* "1 lean", "3 leans" (capitalised with cap) */
  function nWord(n, cap) { return n + " " + (n === 1 ? word(cap ? "One" : "one") : word(cap ? "Many" : "many")); }
  function applyCall(scope) {
    if (callName() !== "picks") return;
    (scope || document).querySelectorAll("[data-pick]").forEach(function (n) { n.textContent = n.getAttribute("data-pick"); });
  }

  /* ---------- the replay against the close (data/replay.js), said where a reader decides ---------- */
  function replayData() { const r = window.REPLAY_DATA; return r && Array.isArray(r.leagues) && r.leagues.length ? r : null; }
  /* "−4.8%": a typographic minus, for prose */
  function roiText(v) { v = Number(v); return (v < 0 ? "−" : v > 0 ? "+" : "") + Math.abs(v).toFixed(1) + "%"; }
  /* "NHL −4.8%, NBA −7.9%, NFL −9.5%"; with detail "NHL −4.8% ± 3.7 over 883, …" (the performance page) */
  function replayFigures(detail) {
    const r = replayData();
    if (!r) return "";
    return r.leagues.filter(l => Number.isFinite(Number(l.roiClose))).map(function (l) {
      return l.league + " " + roiText(l.roiClose) + (detail && Number.isFinite(Number(l.se)) ? " ± " + Number(l.se).toFixed(1) : "") + (detail && Number.isFinite(Number(l.picks)) ? " over " + Number(l.picks).toLocaleString("en-US") : "");
    }).join(", ");
  }
  function replayText(detail) {
    const f = replayFigures(detail), leans = callName() === "leans";
    const figs = !f ? "" : detail ? ": " + f + " (ROI at the close, one unit on each)" : " (" + f + " ROI at the close)";
    return "In a replay of past seasons " + (leans ? "these leans" : "the model’s selections") + " did not beat the closing price" + figs + ". " +
      (leans ? "They become picks when the live record beats the close." : "Judge them by the live record.");
  }
  /* every [data-replay] slot gets the sentence with the figures (data-replay="detail" adds the error and the count);
     without the file the static sentence in the HTML stays */
  function replayNotes(scope) { if (!window.REPLAY_DATA) return; (scope || document).querySelectorAll("[data-replay]").forEach(function (n) { n.textContent = replayText(n.getAttribute("data-replay") === "detail"); }); }

  /* ---------- the bar: how far our probability must beat the price ----------
     Since 2026-11-05 every pick and market row carries its own bar: the model's own margin of error on that side
     (barParts.error), never under the floor (the market file's threshold, 3 points). It rises when the model knows less
     (early season, few games) and falls to the floor as the season fills in. Picks logged before then carry none and
     read as the floor. Confidence is how far past its bar a pick was posted: Lean from 0, Medium from 2, High from 5. */
  /* the lowest tier's name on the page (owner decision, 2026-11-08): the data calls it "Lean", which read badly once the
     selections themselves became leans (a "Lean" badge on a lean), so every page shows it as "Low". The data, the
     badge classes (.badge-conf-lean) and the filters' values keep "Lean"; tierLabel names one tier, tierText rewrites
     the tier's name inside the pipeline's breakdown sentences, written before 2026-11-08 ("Lean starts at 3.0 points"). */
  function tierLabel(c) { return c === "Lean" ? "Low" : c; }
  function tierText(s) { return String(s == null ? "" : s).replace(/\bLean\b/g, "Low"); }
  const DEFAULT_BAR = 0.03, DEFAULT_WATCH = 0.015, DEFAULT_RULE = { watchShare: 0.5, medium: 0.02, high: 0.05 };
  function finiteNum(v) { return v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : NaN; }
  /* the floor every bar sits on */
  function floorBar() { const m = window.MARKET_DATA || {}, t = finiteNum(m.threshold), f = finiteNum(m.barRule && m.barRule.floor); return t > 0 ? t : f > 0 ? f : DEFAULT_BAR; }
  function barRule() { const r = (window.MARKET_DATA || {}).barRule || {}; const n = function (k) { const v = finiteNum(r[k]); return v > 0 ? v : DEFAULT_RULE[k]; }; return { floor: floorBar(), watchShare: n("watchShare"), medium: n("medium"), high: n("high") }; }
  /* true when a pick or row carries a bar of its own (everything priced from 2026-11-05) */
  function hasOwnBar(x) { return !!x && finiteNum(x.bar) > 0; }
  /* the bar this pick or row had to clear: its own, else the floor; with no argument, the floor */
  function barOf(x) { return hasOwnBar(x) ? Number(x.bar) : floorBar(); }
  function watchOf() { const m = window.MARKET_DATA, t = m && Number(m.watch); return Number.isFinite(t) && t > 0 ? t : DEFAULT_WATCH; }
  /* a side is on watch from halfway to its own bar (never under the file's watch line) */
  function watchLineOf(x) { return Math.max(watchOf(), barOf(x) * barRule().watchShare); }
  /* "3" or "10.8": a threshold in points, for copy */
  function ptsLabel(v) { return String(Math.round(v * 1000) / 10); }
  function barPts(x) { return ptsLabel(barOf(x)); }
  function watchPts() { return ptsLabel(watchOf()); }
  /* the edge of a pick (from its price) or a market row (as priced); NaN without a model */
  function edgeFor(x) { const e = x ? finiteNum(x.edge) : NaN; return Number.isFinite(e) ? e : edgeOf(x); }
  /* points past its own bar (negative: short of it), as a fraction; NaN without a model */
  function pastOf(x) { const e = edgeFor(x); if (Number.isFinite(e)) return e - barOf(x); const p = finiteNum(x && x.past); return Number.isFinite(p) ? p : NaN; }
  function pastNum(x) { const p = pastOf(x); return Number.isFinite(p) ? p : -9; }
  /* "this pick’s bar of 10.8 points" or, for a pick posted before bars were set per side, "the 3-point bar" */
  function barName(x, whose) { return hasOwnBar(x) ? (whose || "its") + " bar of " + barPts(x) + " points" : "the " + barPts(x) + "-point bar"; }
  /* "5.2 past" or "1.4 short" */
  function pastWord(x) { const p = pastOf(x); return !Number.isFinite(p) ? "" : p >= 0 ? (p * 100).toFixed(1) + " past" : (-p * 100).toFixed(1) + " short"; }
  /* the same against the bar, as a phrase: "0.5 past its bar of 13.2 points", "0.9 short of its bar of 5.7 points" (past
     takes no "of": the old template joined pastWord and " of its bar" and read "0.5 past of its bar"); brief drops the
     size: "0.5 past its bar", "0.9 short of its bar" */
  function barGap(x, brief) {
    const p = pastOf(x);
    if (!Number.isFinite(p)) return "";
    const name = !brief ? barName(x) : hasOwnBar(x) ? "its bar" : "the " + barPts(x) + "-point bar";
    return p >= 0 ? (p * 100).toFixed(1) + " past " + name : (-p * 100).toFixed(1) + " short of " + name;
  }
  /* the line under a card's numbers: "Bar 10.8 pts | 5.2 past" */
  function barLine(p, cls) {
    if (!hasModel(p) || !Number.isFinite(pastOf(p))) return null;
    const own = hasOwnBar(p), slipped = standingOf(p), now = slipped ? nowPast(p) : null;
    /* a locked pick that slipped says both, one line each: where it was posted, and where it stands at the last check
       ("Posted: bar 3 pts, 13.5 past" over "Now 1.3 short of 6.1"), so the card never reads as a bet it no longer is */
    return el("span", { class: "meta pick-bar" + (slipped ? " is-slipped" : "") + (cls ? " " + cls : ""), title: own ? "The edge this side has to clear: the model’s own margin of error on it, never under " + ptsLabel(floorBar()) + " points" : "Posted before each side had its own bar: held to the " + barPts(p) + "-point bar" }, [
      el("span", {}, [slipped ? "Posted: bar " : "Bar ", el("span", { class: "mono", text: barPts(p) }), " pts", slipped ? ", " : ""].concat(slipped ? [el("span", { class: "bar-past", text: pastWord(p) })] : [])),
      slipped ? el("span", { class: "bar-short" }, now ? ["Now ", el("span", { class: "mono", text: now.short }), " short of ", el("span", { class: "mono", text: now.bar })] : [slipped === "gone" ? "Now no edge" : "Now under its bar"])
        : el("span", { class: pastOf(p) >= 0 ? "bar-past" : "bar-short", text: pastWord(p) })
    ]);
  }
  /* a slipped pick at the last check: points short of the bar it is held to now. null without the numbers, or when it
     has no edge left (then it is "Now no edge") */
  function nowPast(p) {
    const n = p && p.now; if (!n) return null;
    const edge = finiteNum(n.edge), bar = finiteNum(n.bar) > 0 ? Number(n.bar) : barOf(p);
    if (!Number.isFinite(edge) || edge <= 0 || !(edge < bar)) return null;
    return { short: ((bar - edge) * 100).toFixed(1), bar: ptsLabel(bar) };
  }
  /* the tier, said plainly: how far past which bar, and what the bar is */
  function barSentence(p) {
    const past = pastOf(p);
    if (!hasModel(p) || !Number.isFinite(past)) return "";
    const rule = barRule(), bp = p.barParts || null, own = hasOwnBar(p);
    let s = (p.confidence ? tierLabel(p.confidence) + ": " : "") + (past >= 0 ? (past * 100).toFixed(1) + " points past " : (-past * 100).toFixed(1) + " points short of ") + barName(p) + ".";
    if (own && bp && finiteNum(bp.error) > 0) {
      const gp = finiteNum(bp.gp), units = finiteNum(bp.units), floor = finiteNum(bp.floor) > 0 ? Number(bp.floor) : rule.floor;
      const parts = [Number.isFinite(gp) ? "at least " + gp + (gp === 1 ? " game" : " games") + " behind each team" : null, Number.isFinite(units) ? "±" + units.toFixed(1) + " " + (bp.unit || "points") + " on the " + (p.marketKey === "totals" ? "total" : "margin") : null].filter(Boolean).join(", ");
      s += Number(bp.error) < floor - 1e-9
        ? " The model’s own margin of error on this side is " + ptsLabel(Number(bp.error)) + " points" + (parts ? " (" + parts + ")" : "") + ", under the floor, so the bar is " + ptsLabel(floor) + "."
        : " The bar is the model’s own margin of error on this side" + (parts ? " (" + parts + ")" : "") + "; it never drops under " + ptsLabel(floor) + ".";
    } else if (own) s += " The bar is the model’s own margin of error on this side; it never drops under " + ptsLabel(rule.floor) + ".";
    else s += " It was posted before each side had its own bar, so it is held to the bar it was posted under.";
    s += " Medium starts " + ptsLabel(rule.medium) + " points past the bar, High " + ptsLabel(rule.high) + "." + (p.model && p.model.thin ? " A thin sample stays Low." : "");
    return s;
  }

  /* ---------- locked picks: a pick is never pulled because a later check moved it; it is graded at the posted price ---------- */
  /* "below" (an edge, under its bar now) or "gone" (no edge now), on open picks only; null otherwise */
  function standingOf(p) { if (!p || p.isMarket || !isOpen(p)) return null; return p.standing === "below" || p.standing === "gone" ? p.standing : null; }
  function standingNow(p) {
    const n = p && p.now; if (!n) return "";
    const prob = finiteNum(n.modelProb), odds = finiteNum(n.odds), edge = finiteNum(n.edge), bar = finiteNum(n.bar) > 0 ? Number(n.bar) : barOf(p), at = Date.parse(n.at || "");
    if (!Number.isFinite(prob) || !Number.isFinite(odds) || odds === 0) return "";
    /* the bar can move between runs (and a pick posted before per-side bars was held to 3): say both when they differ */
    const moved = Math.abs(bar - barOf(p)) >= 0.0005;
    return "At the last check" + (Number.isFinite(at) ? " (" + clockET(at) + ")" : "") + " we make it " + pct(prob) + " against " + fmtOdds(odds) + (n.book ? " at " + n.book : "") +
      (p.standing === "gone" ? ": no edge left at that price." : Number.isFinite(edge) ? ": an edge of " + (edge * 100).toFixed(1) + " points, under its bar " + (moved ? "now of " + ptsLabel(bar) + " (posted against " + barPts(p) + ")." : "of " + ptsLabel(bar) + ".") : ".");
  }
  function standingChip(p) {
    const s = standingOf(p);
    if (!s) return null;
    return el("span", { class: "badge badge-standing badge-" + s, title: ("Locked: it stays on the card and is graded at the posted price. " + standingNow(p)).trim(), text: s === "gone" ? "Edge gone" : "Below its bar now" });
  }
  /* one line for the breakdown */
  function standingLine(p) { return standingOf(p) ? ("Locked: graded at the posted price. " + standingNow(p)).trim() : ""; }

  /* ---------- who plays changed after a lean was posted (the pipeline's flag since 2026-11-08, on the pages since 2026-11-10) ----------
     A posted NBA lean carries `availability`: who the model knew about when it was posted (`posted`: the report, the
     listed players) and whether that has changed since (`changed`, with the pipeline's own sentence in `note` and
     `swing`, the points of margin toward the lean's side; null for a total). It is only a flag: the lean stays posted,
     locked and graded at its posted price. Read from the field, never the sport, so another league's flag shows too. */
  function flagOf(p) { const a = p && !p.isMarket ? p.availability : null; return a && a.changed === true ? a : null; }
  /* against the lean's side, for it, or neither (a total, or a swing too small to say) */
  function flagDir(a) { const s = finiteNum(a && a.swing); return !Number.isFinite(s) || Math.abs(s) < 0.05 ? "flat" : s < 0 ? "against" : "for"; }
  function flagNote(p) {
    const a = flagOf(p);
    if (!a) return "";
    const n = String(a.note || "").trim().replace(/[.\s]+$/, "") || "Who plays changed after this " + word("one") + " was posted";
    return n + ". It stays posted and is graded at the posted price.";
  }
  function flagChip(p) { const a = flagOf(p); return a ? el("span", { class: "badge badge-standing badge-flag is-" + flagDir(a), title: flagNote(p), text: "Who plays changed" }) : null; }
  /* the chip and the note together, for a card, the breakdown and the game page */
  function flagLine(p, cls) { return flagOf(p) ? el("p", { class: "pick-note pick-flag" + (cls ? " " + cls : "") }, [flagChip(p), el("span", { text: flagNote(p) })]) : null; }
  /* who the lean was posted knowing about: "Posted on the 3:30 PM ET official injury report: Jamal Murray (Denver) questionable." */
  function postedKnowing(p) {
    const a = p && p.availability, post = a && a.posted;
    if (!post) return "";
    const lead = post.report && post.report.label ? "Posted on the " + post.report.label + " official injury report" : "Posted on ESPN’s injury list";
    const who = (post.players || []).filter(function (x) { return x && x.name; }).map(function (x) { const team = x.side === "home" ? p.home : x.side === "away" ? p.away : ""; return x.name + (team ? " (" + team + ")" : "") + (x.status ? " " + String(x.status).toLowerCase() : ""); });
    return lead + (who.length ? ": " + who.join("; ") + "." : ": no one listed who moves the number.");
  }
  /* a side past its bar that is neither a lean nor held says what keeps it off (the market card's own reason, in short) */
  function offLine(p) {
    if (!p || !p.isMarket || !isOpen(p) || isHeld(p) || !hasModel(p) || !(pastNum(p) >= 0)) return null;
    return el("p", { class: "pick-note pick-off", text: p.ruledOut ? "Past its bar on paper, but the model does not post from this market: the replay of past seasons found no signal in it." : "Clears its bar, but the caps keep it off the board: one " + word("one") + " a game, ten a day, five a sport." });
  }
  /* a held game's note on a card: why the side or the game is held and when that is decided */
  function heldLine(p, cls) { return isHeld(p) && isOpen(p) ? el("p", { class: "pick-note pick-held" + (cls ? " " + cls : ""), text: heldNote(p) }) : null; }

  /* ---------- line shopping: every book's price on the pick's line ---------- */
  /* a book "clears the bar" when its price still leaves our probability the full edge this pick's own bar needs */
  const BOOK_ABBR = { DraftKings: "DK", FanDuel: "FD", BetMGM: "MGM", Caesars: "CZR", BetRivers: "BR", Fanatics: "FAN", "ESPN BET": "ESPN", Bovada: "BOV", "BetOnline.ag": "BOL", Pinnacle: "PIN", LowVig: "LV", "Hard Rock Bet": "HRB", Bet365: "365", PointsBet: "PB", Unibet: "UNI" };
  function bookAbbr(name) { return BOOK_ABBR[name] || String(name || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase(); }
  function lineShop(p) {
    const ours = hasModel(p) ? Number(p.modelProb) : NaN, prices = (p && p.prices) || {}, BAR = barOf(p);
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
    const s = lineShop(p), bar = barName(p, "this " + word("one") + "’s");
    if (!s.books) return "";
    if (s.books === 1) return "Only " + s.best.book + " is priced on this line.";
    let t = "Best price " + fmtOdds(s.best.price) + " at " + s.best.book + ". ";
    t += "The worst, " + fmtOdds(s.worst.price) + " at " + s.worst.book + ", gives up " + (s.costWorst * 100).toFixed(1) + " points of edge. ";
    t += s.clears === s.books ? "Every one of the " + s.books + " books clears " + bar + "." : s.clears === 1 ? "Only " + s.best.book + " clears " + bar + "; the edge lives at one book." : s.clears ? s.clears + " of " + s.books + " books clear " + bar + "." : "None of the " + s.books + " books clears " + bar + " now.";
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
  /* "Today", "Tomorrow", "Yesterday" or "Thu Nov 6", relative to the current Eastern date (the site's one clock) */
  function dayLabel(key) {
    if (!key) return "Date to be confirmed";
    const today = etKey(new Date(now()));
    if (key === today) return "Today";
    if (key === shiftKey(today, 1)) return "Tomorrow";
    if (key === shiftKey(today, -1)) return "Yesterday";
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

  /* ---------- one clock (owner ask, 2026-11-05: picks "pop and go or stay past tip off") ----------
     Every page asks the same clock whether a game has started, so nothing looks bettable after its start.
     window.EDGELINE_NOW (ms) pins the clock for tests; otherwise it is the visitor's clock. */
  function now() {
    const v = window.EDGELINE_NOW;
    if (v == null || v === "") return Date.now();
    const t = typeof v === "number" ? v : /^\d+$/.test(String(v)) ? Number(v) : Date.parse(v);
    return Number.isFinite(t) ? t : Date.now();
  }
  /* an Eastern wall-clock time on an Eastern date, as a timestamp (handles the EST/EDT switch) */
  const etParts = new Intl.DateTimeFormat("en-US", { timeZone: ET_ZONE, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" });
  function etWallMs(key, h, mi) {
    const k = String(key).split("-").map(Number), want = Date.UTC(k[0], k[1] - 1, k[2], h, mi);
    let t = want + 5 * 36e5;
    for (let i = 0; i < 2; i++) {
      const o = {}; etParts.formatToParts(new Date(t)).forEach(function (x) { o[x.type] = Number(x.value); });
      t += want - Date.UTC(o.year, o.month - 1, o.day, o.hour === 24 ? 0 : o.hour, o.minute);
    }
    return t;
  }
  /* when the game starts: commence, else the start label read the way dayKey reads it ("Tonight 8:00 PM ET", "Sun 4:25 PM ET"); NaN when unknown */
  function startMs(p) {
    if (!p) return NaN;
    const t = Date.parse(p.commence || "");
    if (Number.isFinite(t)) return t;
    const key = dayKey(p), m = String(p.start || "").match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
    if (!key || !m) return NaN;
    return etWallMs(key, Number(m[1]) % 12 + (m[3].toUpperCase() === "PM" ? 12 : 0), Number(m[2]));
  }
  /* a game's usual length, start to final: past it with no result a pick is "awaiting" rather than "live" */
  const GAME_HOURS = { NBA: 2.5, NFL: 3.5, NCAAF: 3.5, NHL: 3, MLB: 3.5, Soccer: 2 };
  const KEY_SPORT = { basketball_nba: "NBA", americanfootball_nfl: "NFL", americanfootball_ncaaf: "NCAAF", icehockey_nhl: "NHL", baseball_mlb: "MLB" };
  function gameHours(p) {
    const s = GAME_HOURS[p.sport] ? p.sport : KEY_SPORT[p.sportKey] || (/^soccer/.test(p.sportKey || "") || /premier league|la liga|mls|soccer/i.test(p.league || "") ? "Soccer" : null);
    return s ? GAME_HOURS[s] : 3;
  }
  const SOON_MS = 90 * 60e3;
  function hasResult(p) { return !!p && ((p.result != null && p.result !== "") || p.status === "graded" || p.status === "void"); }
  /* upcoming | soon (starts within 90 minutes) | live (started, no result, inside the sport's usual length) | awaiting (past it, no result yet) | final (has a result) */
  function gameState(p) {
    if (!p) return "upcoming";
    if (hasResult(p)) return "final";
    const t = startMs(p), n = now();
    let s;
    if (!Number.isFinite(t)) { const k = dayKey(p); s = k && k < etKey(new Date(n)) ? "awaiting" : "upcoming"; }
    else if (n < t) s = t - n <= SOON_MS ? "soon" : "upcoming";
    else s = n - t < gameHours(p) * 36e5 ? "live" : "awaiting";
    /* the pipeline's own word wins over a slow clock: a pick it calls started is never bettable */
    return p.started === true && (s === "upcoming" || s === "soon") ? "live" : s;
  }
  /* bettable: not started and no result */
  function isOpen(p) { const s = gameState(p); return s === "upcoming" || s === "soon"; }
  function openOnly(list) { return (list || []).filter(isOpen); }
  /* the result as a word: Won, Lost, Push, Void, or Final when graded without one */
  function resultWord(p) {
    const r = String((p && p.result) || "").toLowerCase();
    if (r === "win" || r === "won") return "Won";
    if (r === "loss" || r === "lost") return "Lost";
    if (r === "push") return "Push";
    if (p && (p.status === "void" || r === "void")) return "Void";
    return "Final";
  }
  /* the state chip: Live, Awaiting result, Won, Lost, Push, Void (and Starts soon for an open game when asked) */
  const STATE_RANK = { live: 0, awaiting: 1, final: 2, soon: 3, upcoming: 4 };
  function stateKey(p) { const s = gameState(p); return s === "final" ? resultWord(p).toLowerCase() : s; }
  function stateText(p) { const s = gameState(p); return s === "live" ? "Live" : s === "awaiting" ? "Awaiting result" : s === "final" ? resultWord(p) : s === "soon" ? "Starts soon" : "Upcoming"; }
  function stateChip(p, opts) {
    const s = gameState(p);
    if ((s === "upcoming" || s === "soon") && !(opts && opts.open)) return null;
    return el("span", { class: "badge badge-state badge-" + stateKey(p), title: s === "live" ? "Started, no result yet" : s === "awaiting" ? "Past the usual length of the game; the grade comes from the final score" : null, text: stateText(p) });
  }
  /* "8:00 PM ET", with the day when it is not today ("yesterday 4:31 PM ET", "Thu Nov 6, 1:00 PM ET") */
  const etClock = new Intl.DateTimeFormat("en-US", { timeZone: ET_ZONE, hour: "numeric", minute: "2-digit" });
  function whenParts(ms) {
    const d = new Date(ms), key = etKey(d), today = etKey(new Date(now()));
    const day = key === today ? "" : key === shiftKey(today, -1) ? "yesterday" : key === shiftKey(today, 1) ? "tomorrow" : shortDate(keyDate(key), true) + ",";
    return { day: day, time: etClock.format(d) + " ET" };
  }
  function clockET(ms) { if (!Number.isFinite(ms)) return ""; const w = whenParts(ms); return (w.day ? w.day + " " : "") + w.time; }
  /* "about 5:00 PM ET", "tomorrow about 10:00 AM ET": runs are scheduled, and GitHub can start them late */
  function aboutET(ms) { if (!Number.isFinite(ms)) return ""; const w = whenParts(ms); return (w.day ? w.day + " " : "") + "about " + w.time; }
  /* the start as a label, in the pipeline's own wording (startLabel in scripts/update-data.js: "Today 8:10 PM ET",
     "Tomorrow …", "Yesterday …", a bare weekday for any other day) but against the site's one clock. The pipeline writes
     `start` when it writes the file, so from midnight ET until the next run every game played today still read
     "Tomorrow" (2026-11-10); every page now builds the label from `commence` instead. A pick or row with no `commence`
     keeps its `start`. opts.date: a day past tomorrow carries its date ("Thu Nov 12, 8:15 PM ET"), for a game page that
     can be a week out. */
  function startLabel(p, opts) {
    if (!p) return "";
    const t = Date.parse(p.commence || "");
    if (!Number.isFinite(t)) return p.start || "";
    const d = new Date(t), key = etKey(d), today = etKey(new Date(now()));
    const day = key === today ? "Today" : key === shiftKey(today, 1) ? "Tomorrow" : key === shiftKey(today, -1) ? "Yesterday" : opts && opts.date ? shortDate(keyDate(key), true) + "," : etDow.format(d);
    return day + " " + etClock.format(d) + " ET";
  }

  /* ---------- update times: when the picks were published, when the numbers last moved, when the next run is due ----------
     The schedules are in UTC, as the workflows and routines run them (so the Eastern times shift by an hour with daylight
     saving): track runs hourly at :00 from 15:00 to 06:00 UTC (10 AM to 1 AM EST; they commit only when a number moved);
     full runs, which publish picks and reprice every market, at 14:00 and 20:30 UTC (9:00 AM and 3:30 PM EST; the
     morning one moved from noon on 2026-11-05 to catch prices nearer the open). */
  const TRACK_UTC = [15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6], FULL_UTC = [[14, 0], [20, 30]];
  function nextRun(fullOnly) {
    const n = now(), d = new Date(n), slots = fullOnly ? FULL_UTC : TRACK_UTC.map(function (h) { return [h, 0]; }).concat(FULL_UTC);
    let best = Infinity;
    [0, 1, 2].forEach(function (off) { slots.forEach(function (s) { const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + off, s[0], s[1]); if (t > n && t < best) best = t; }); });
    return best;
  }
  /* a full run's time today in Eastern, for copy: runClock(0) "9 AM ET" (the morning run, 10 AM in summer), runClock(1) "3:30 PM ET" */
  function runClock(i) {
    const s = FULL_UTC[i] || FULL_UTC[0], d = new Date(now());
    return etClock.format(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), s[0], s[1]))).replace(":00", "") + " ET";
  }
  /* which full runs price a sport (the slot rule in scripts/update-data.js: SPORTS[].slots and runDays): the NBA, the NFL
     and soccer on the afternoon run only, college football on Friday's afternoon run only, every other sport on both.
     Change these with the pipeline's slot rule. runAfter: the sport's first full run at or after `from` (strict: after) */
  const AFTERNOON_ONLY = { NBA: true, NFL: true, NCAAF: true, Soccer: true }, RUN_DAYS = { NCAAF: [5] };
  function runAfter(sport, from, strict) {
    const d = new Date(from), days = RUN_DAYS[sport], slots = AFTERNOON_ONLY[sport] ? [FULL_UTC[1]] : FULL_UTC;
    let best = Infinity;
    for (let off = 0; off < 8; off++) slots.forEach(function (s) {
      const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + off, s[0], s[1]);
      if (days && days.indexOf(new Date(t).getUTCDay()) === -1) return; /* both runs fall on the same Eastern weekday as their UTC date */
      if ((strict ? t > from : t >= from) && t < best) best = t;
    });
    return best;
  }
  function nextRunFor(sport) { return runAfter(sport, now(), true); }
  /* the parts of the line; opts.lines is the Games page, whose prices come only from the full runs */
  function updateParts(opts) {
    opts = opts || {};
    const d = window.PICKS_DATA || {}, m = window.MARKET_DATA || {};
    const pub = Date.parse(d.generatedAt || ""), tracked = Date.parse(d.trackedAt || ""), priced = Date.parse(m.generatedAt || "");
    if (opts.lines) return [
      Number.isFinite(priced) ? "Lines priced " + clockET(priced) + " (" + ago(priced) + ")" : "Lines not priced yet",
      /* a game page names its sport: the NBA, the NFL and soccer are priced on the afternoon run only */
      "Next pricing " + aboutET(opts.sport ? nextRunFor(opts.sport) : nextRun(true)),
      Number.isFinite(tracked) && tracked > priced ? word("Many") + " rechecked " + clockET(tracked) : null
    ];
    const times = [pub, tracked, priced].filter(Number.isFinite), latest = times.length ? Math.max.apply(null, times) : NaN;
    const fresher = Number.isFinite(latest) && (!Number.isFinite(pub) || latest - pub > 60e3);
    return [
      Number.isFinite(pub) ? word("Many") + " published " + clockET(pub) + (fresher ? "" : " (" + ago(pub) + ")") : null,
      fresher ? "Updated " + clockET(latest) + " (" + ago(latest) + ")" : null,
      "Next check " + aboutET(nextRun(false))
    ];
  }
  function renderLine(h) { h.host.replaceChildren(meta(updateParts(h.opts), "update-line")); }
  /* fills host with the line and keeps it current once a minute */
  function updateLine(host, opts) { if (!host) return; const h = { host: host, opts: opts || {} }; lineHosts.push(h); renderLine(h); startClock(); }
  function refreshLines() { lineHosts.forEach(function (h) { if (h.host.isConnected) renderLine(h); }); }
  /* "12 min ago", "2 hr ago" */
  function ago(ms) {
    const m = Math.round((now() - ms) / 60e3);
    if (!(m >= 1)) return "just now";
    if (m < 60) return m + " min ago";
    const h = Math.round(m / 60);
    return h < 48 ? h + " hr ago" : Math.round(h / 24) + " days ago";
  }
  /* the final score as the live pill writes it: away first ("NEW 0–2 CHE") */
  function teamAbbr(p, which) { const name = p[which]; const t = TM() && name ? TM().find(p.sportKey || p.sport, name) : null; return t && t.abbr ? t.abbr : name || (which === "home" ? "Home" : "Away"); }
  function scoreText(p) {
    const s = p && p.score;
    if (!s || s.home == null || s.away == null) return "";
    return teamAbbr(p, "away") + " " + s.away + "–" + s.home + " " + teamAbbr(p, "home");
  }
  function unitsText(p) { const u = Number(p && p.units); return p && p.units != null && Number.isFinite(u) ? signed(u, 2) + "u" : ""; }

  /* ---------- the timer: once a minute, re-render whatever changed state (a game started, a result landed) ---------- */
  const stateWatchers = [], lineHosts = [];
  let stateSig = null, stateTimer = null;
  function trackedItems() {
    const d = window.PICKS_DATA || {}, m = window.MARKET_DATA || {};
    return (d.picks || []).concat(d.playOfDay ? [d.playOfDay] : [], m.rows || []);
  }
  /* one letter per item (u, s, l, a, f), so any change of state changes the string */
  function stateSignature() { return trackedItems().map(function (p) { return gameState(p).charAt(0); }).join(""); }
  function checkStates(force) {
    const sig = stateSignature(), changed = force === true || (stateSig !== null && sig !== stateSig);
    stateSig = sig;
    if (changed) {
      stateWatchers.slice().forEach(function (fn) { fn(); });
      syncButtons();
      /* new live slots are empty until js/live.js looks again; ask it now (real data only, it polls ESPN) */
      if (window.EdgeLineLive && !isSample()) { try { const r = window.EdgeLineLive.refresh(); if (r && r.catch) r.catch(function () {}); } catch (e) { /* the page works without live status */ } }
    }
    refreshLines();
    return changed;
  }
  /* a page registers its re-render; the first registration starts the minute timer */
  function onStateChange(fn) {
    if (stateSig === null) stateSig = stateSignature();
    if (typeof fn === "function") stateWatchers.push(fn);
    startClock();
  }
  function startClock() {
    if (stateTimer) return;
    if (stateSig === null) stateSig = stateSignature();
    stateTimer = setInterval(checkStates, 60e3);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) checkStates(); });
  }

  /* ---------- the market board: every priced market from the last odds run, pick or not ---------- */
  function marketData() { const m = window.MARKET_DATA; return m && Array.isArray(m.rows) ? m : { sample: true, rows: [], threshold: DEFAULT_BAR, watch: DEFAULT_WATCH, games: 0, generatedAt: null }; }
  function statusLabel(st) { return st === "pick" ? word("One") : st === "held" ? "Held" : st === "watch" ? "Watch" : "No bet"; }
  /* the status a row earns from its edge against its own bar: watch from halfway to the bar up, never a pick (that needs
     the board). A side the pipeline itself rules out (the file's status "none" on an edge that would read as watch: a
     market with no signal in the replay, a held college moneyline) is never on watch, whatever its price */
  function rowStatus(r) { return hasModel(r) && r.status !== "none" && rowEdge(r) >= watchLineOf(r) ? "watch" : "none"; }

  /* ---------- held games (2026-11-10) ----------
     A game the pipeline holds posts nothing until its news is in: an NBA game whose clubs are not both on the league's
     official injury report yet (RULES.availabilityHold in scripts/update-data.js). Every market row of a held game
     carries `waiting`, the reasons as text ("report not in for both clubs"), null otherwise. The pages read that field
     and never the sport's name, so any game that carries it is held, whatever the league and whatever the reason.
     A held side that clears its own bar is "Held", a state of its own: neither on watch (it is past its bar) nor kept
     off by the caps (one lean a game, ten a day, five a sport). */
  function waitingOf(x) { const w = x && x.waiting; return (Array.isArray(w) ? w : typeof w === "string" ? [w] : []).map(function (s) { return String(s == null ? "" : s).trim(); }).filter(Boolean); }
  function isHeld(x) { return waitingOf(x).length > 0; }
  function heldClears(x) { return isHeld(x) && hasModel(x) && x.status !== "none" && !x.ruledOut && pastNum(x) >= 0; }
  /* the reasons as one phrase: "report not in for both clubs" */
  function heldWhy(x) { return waitingOf(x).join("; "); }
  /* when a held game is priced again: its sport's next full run, if that is before the start; NaN when none is left */
  const SPORT_WORD = { NCAAF: "college football", Soccer: "soccer" };
  function heldRun(x) { const t = nextRunFor(x && x.sport), s = startMs(x); return Number.isFinite(t) && (!Number.isFinite(s) || t < s) ? t : NaN; }
  /* "Decided at the next NBA pricing run, about 3:30 PM ET."; inline: the same as a clause, "decided at the next NBA pricing run, about 3:30 PM ET" */
  function heldWhen(x, inline) {
    const t = heldRun(x), sport = x && x.sport ? (SPORT_WORD[x.sport] || x.sport) + " " : "";
    const s = Number.isFinite(t) ? "decided at the next " + sport + "pricing run, " + aboutET(t) : "no pricing run is left before the start";
    return inline ? s : s.charAt(0).toUpperCase() + s.slice(1) + (Number.isFinite(t) ? "." : ", so nothing posts from this game.");
  }
  /* the whole of it for a card, a paragraph or a title: why this side or game is held, and when that is decided; "" when it is not */
  function heldNote(x) {
    if (!isHeld(x)) return "";
    return (heldClears(x) ? "Clears its bar but is held: " : "This game is held: ") + heldWhy(x) + ". " + heldWhen(x);
  }
  /* the chip a market row shows: Held for a held side that clears its bar, else its status against its own bar */
  function chipStatus(r) { return heldClears(r) ? "held" : rowStatus(r); }
  /* a row is a pick only while its pickId is on the current board */
  function rowOnBoard(r) { if (!r || !r.pickId) return false; return ((window.PICKS_DATA || {}).picks || []).some(function (p) { return p.id === r.pickId; }); }
  /* a market row dressed as a pick so the card, board and digest code can show it; never confused with a real pick */
  function marketAsPick(r, i, onBoard) {
    const modelled = hasModel(r) && r.edge != null && Number.isFinite(Number(r.edge));
    const edge = modelled ? Number(r.edge) : NaN, bar = barOf(r), barLabel = barName(r), implied = pct(impliedProb(r.odds));
    /* a row is a pick only while that pick is on the current board; otherwise it is market information, whatever the file says */
    const status = onBoard ? "pick" : modelled ? chipStatus(r) : "none", held = !onBoard && isHeld(r);
    /* a side the pipeline rules out whatever its price (the file's status "none" on an edge past its bar: a market the
       replay found no signal in, or a held college moneyline) is not kept off by the caps or by a hold */
    const ruledOut = !onBoard && modelled && r.status === "none" && edge >= bar;
    /* a held game's side says why it is held and when that is decided; only a side the caps keep off says so */
    const why = !modelled ? "No model yet: too little game data behind this one to price it, so there is no probability and no edge."
      : ruledOut ? "Past " + barLabel + " on paper, but the model does not post from this market: the replay of past seasons found no signal in it, so its sides read about even whatever the price."
      : edge >= bar ? "Clears " + barLabel + (onBoard ? "." : held ? " but its game is held: " + heldWhy(r) + ". " + heldWhen(r) + " It posts then only if it still clears its bar and is the game’s side furthest past it."
        : " but is not on the board: there is at most one " + word("one") + " per game, ten a day and five per sport, chosen by how far each side clears its own bar.")
      : edge > 0 ? "Edge of " + (edge * 100).toFixed(1) + " points sits under " + barLabel + (hasOwnBar(r) ? ": the model’s own margin of error on this side is bigger than the edge, so it is not a bet." : ": priced about right, not a bet.")
      : "No edge: the price implies " + (-edge * 100).toFixed(1) + " points more than our probability.";
    const heldTail = held && modelled && !(edge >= bar) ? " The game is held too: " + heldWhy(r) + ". " + heldWhen(r) : "";
    const marketRef = typeof r.marketFair === "number" ? "For reference the market makes it " + pct(r.marketFair) + "." : "";
    const rationale = modelled
      ? "Our probability is " + pct(r.modelProb) + ", from the game data: results and margins this season, form, rest, the injury report and home edge. " + r.book + " offers " + fmtOdds(r.odds) + ", which implies " + implied + ". " + why + heldTail + " Not graded against other books' prices." + (marketRef ? " " + marketRef : "")
      : why + " " + r.book + " offers " + fmtOdds(r.odds) + ", which implies " + implied + "." + (marketRef ? " " + marketRef : "");
    return { id: onBoard ? r.pickId : "m" + i, isMarket: !onBoard, status: status, eventId: r.eventId, sport: r.sport, league: r.league, sportKey: r.sportKey, event: r.event, home: r.home, away: r.away, commence: r.commence, start: r.start, marketKey: r.marketKey, market: r.market, outcome: r.outcome, pick: r.pick, odds: r.odds, book: r.book, prices: r.prices || {}, books: r.books, anchor: r.anchor, modelProb: modelled ? r.modelProb : null, ev: modelled ? r.ev : null,
      basis: "game", modelled: modelled, model: r.model || null, marketFair: typeof r.marketFair === "number" ? r.marketFair : null, marketEdge: typeof r.marketEdge === "number" ? r.marketEdge : null,
      bar: hasOwnBar(r) ? Number(r.bar) : null, past: modelled ? edge - bar : null, barParts: r.barParts || null, waiting: held ? waitingOf(r) : null, ruledOut: ruledOut,
      confidence: onBoard ? "Lean" : statusLabel(status),
      rationale: rationale,
      factors: ["Best price " + fmtOdds(r.odds) + " at " + r.book, modelled ? "Probability " + pct(r.modelProb) + " from game data, not other books" : "No model yet: no probability from game data", modelled ? "Edge " + signed(edge * 100, 1) + " points over the price" : "No edge until the game has a model", modelled ? "Bar " + ptsLabel(bar) + " points: " + (edge >= bar ? ((edge - bar) * 100).toFixed(1) + " past it" : ((bar - edge) * 100).toFixed(1) + " short" + (clearPrice(r.modelProb, hasOwnBar(r) ? r.bar : null) != null ? ", clears from " + fmtOdds(clearPrice(r.modelProb, hasOwnBar(r) ? r.bar : null)) : "")) : null, held ? "Held: " + heldWhy(r) : null, typeof r.marketFair === "number" ? "Market reference " + pct(r.marketFair) : null].filter(Boolean), breakdown: null, context: null, movement: null };
  }
  /* the closest markets to the bar, best first, skipping the ones that are already picks on the board; a game that has started is never offered (opts.includeStarted keeps it) */
  function marketRows(opts) {
    opts = opts || {};
    const picksOnBoard = {}; ((window.PICKS_DATA || {}).picks || []).forEach(p => { picksOnBoard[p.id] = true; });
    let rows = marketData().rows.filter(r => (!(r.pickId && picksOnBoard[r.pickId]) || opts.includePicks) && (opts.includeStarted || isOpen(r)));
    if (opts.sport) rows = rows.filter(r => r.sport === opts.sport);
    if (opts.positive) rows = rows.filter(r => rowEdge(r) > 0);
    /* today first, then likeliest; a side with no model goes last. byPast is the nearest-miss slot: closest to its own bar first,
       so every sport is measured on one scale (byEdge, raw edge first, is kept for callers that want it) */
    if (opts.byPast) rows = rows.slice().sort((a, b) => (pastNum(b) - pastNum(a)) || (rowEdge(b) - rowEdge(a)));
    else if (opts.byEdge) rows = rows.slice().sort((a, b) => rowEdge(b) - rowEdge(a));
    else rows = rows.slice().sort((a, b) => dayCmp(a, b) || ((rowEdge(b) > 0) - (rowEdge(a) > 0)) || (probOf(b) - probOf(a)) || (rowEdge(b) - rowEdge(a)));
    if (opts.oneSidePerMarket) { const seen = {}; rows = rows.filter(r => { const k = r.eventId + "|" + r.marketKey; if (seen[k]) return false; seen[k] = true; return true; }); }
    if (opts.oneRowPerGame) { const seen = {}; rows = rows.filter(r => { if (seen[r.eventId]) return false; seen[r.eventId] = true; return true; }); }
    return rows.slice(0, opts.limit || rows.length).map((r, i) => marketAsPick(r, i, !!(r.pickId && picksOnBoard[r.pickId])));
  }
  /* ---------- the watchlist (2026-11-10): on a night with no lean, what nearly made it and what would change it ----------
     One entry a game, because the pipeline posts at most one lean a game (the side furthest past its own bar): of an open
     game's sides on watch (rowStatus: at least halfway to the bar, a held side past its bar included; never a side the
     pipeline rules out), the one nearest its bar. A game that already has a lean gets no second, so it is left out, and
     a game that has started is never listed. Each entry: `pick` (the side dressed for the card renderer), `row`, `more`
     (the game's other sides on watch), `kind` ("short" of its bar, "held" past it in a game waiting on its news, "caps"
     past it and kept off by the caps), `price` (the price that clears the bar, for a short side) and `held` (the game is
     held, whichever the kind). Ordered by the site rule: game day, then our probability. Not leans. */
  function watchlist() {
    const picks = (((window.PICKS_DATA || {}).picks) || []).filter(function (p) { return p && p.id && p.status !== "void"; });
    const games = {}, order = [];
    marketData().rows.forEach(function (r) {
      if (!r || !isOpen(r)) return;
      const key = r.eventId != null ? "e" + r.eventId : "n" + r.event + "|" + (r.commence || r.start || "");
      let g = games[key];
      if (!g) { g = games[key] = { sides: [], lean: picks.some(function (p) { return sameGame(r, p); }) }; order.push(g); }
      if (rowStatus(r) === "watch") g.sides.push(r);
    });
    const out = [];
    order.forEach(function (g) {
      if (g.lean || !g.sides.length) return;
      g.sides.sort(function (a, b) { return (pastNum(b) - pastNum(a)) || (probOf(b) - probOf(a)); });
      const r = g.sides[0], past = pastNum(r);
      out.push({ row: r, pick: marketAsPick(r, out.length, false), more: g.sides.length - 1, kind: heldClears(r) ? "held" : past >= 0 ? "caps" : "short", price: clearFor(r), held: isHeld(r) });
    });
    out.sort(function (a, b) { return dayCmp(a.row, b.row) || (probOf(b.row) - probOf(a.row)) || (pastNum(b.row) - pastNum(a.row)); });
    /* ids of their own (w0, w1, …) in display order, so a watch card never shares one with a fallback market card (m0, m1, …) */
    out.forEach(function (e, i) { e.pick.id = "w" + i; });
    return out;
  }
  /* the board's counts, open games only: a game that has started is counted apart (started, startedGames) and never as a market to bet */
  function marketSummary() {
    const m = marketData(), all = m.rows || [], rows = all.filter(isOpen), gone = all.filter(r => !isOpen(r));
    const ids = list => new Set(list.map(r => r.eventId != null ? r.eventId : r.event)).size;
    /* picks are the rows on the current board; watch is read from each row's own bar, so the counts match the table */
    const onBoard = {}; ((window.PICKS_DATA || {}).picks || []).forEach(p => { onBoard[p.id] = true; });
    const isPick = r => !!(r.pickId && onBoard[r.pickId]);
    const watch = rows.filter(r => !isPick(r) && chipStatus(r) === "watch").length, picks = rows.filter(isPick).length;
    /* sides past their own bar that are not on the board, counted apart by what keeps them off: `held`, a game waiting on
       its news (the row's `waiting`), and `clearOff`, the caps (one pick per game, ten a day and five per sport) */
    const heldRows = rows.filter(r => !isPick(r) && heldClears(r)), held = heldRows.length;
    const clearOff = rows.filter(r => !isPick(r) && !isHeld(r) && hasModel(r) && r.status !== "none" && rowEdge(r) >= barOf(r)).length;
    const heldGames = ids(rows.filter(r => !isPick(r) && isHeld(r)));
    const unmodelled = rows.filter(r => !hasModel(r)).length;
    /* closest to its own bar, so a sport with a wide bar is not flattered by a raw edge */
    const best = rows.filter(hasModel).sort((a, b) => (pastNum(b) - pastNum(a)) || (rowEdge(b) - rowEdge(a)))[0] || null;
    const when = m.generatedAt ? new Date(m.generatedAt) : null;
    const games = gone.length && all.every(r => r.eventId != null || r.event) ? ids(rows) : (m.games || 0);
    const sports = (m.sports || []).filter(s => !gone.length || rows.some(r => r.sport === s));
    /* each sport's range of bars over the open modelled rows that carry one (none on files written before 2026-11-05) */
    const bars = [];
    rows.filter(r => hasModel(r) && hasOwnBar(r)).forEach(function (r) {
      let b = bars.find(x => x.sport === r.sport); if (!b) { b = { sport: r.sport, min: Infinity, max: -Infinity }; bars.push(b); }
      b.min = Math.min(b.min, Number(r.bar)); b.max = Math.max(b.max, Number(r.bar));
    });
    const order = s => { const i = (m.sports || []).indexOf(s); return i === -1 ? 99 : i; };
    bars.sort((a, b) => order(a.sport) - order(b.sport) || (a.sport < b.sport ? -1 : 1));
    return { games: games, markets: rows.length, picks: picks, watch: watch, best: best, sports: sports, generatedAt: when && !isNaN(when) ? when : null, threshold: floorBar(), watchEdge: watchOf(), barPts: barPts(), watchPts: watchPts(), clearOff: clearOff, held: held, heldRows: heldRows, heldGames: heldGames, bars: bars, ownBars: bars.length > 0, modelled: Number.isFinite(Number(m.modelled)) ? Number(m.modelled) : null, unmodelled: unmodelled, started: gone.length, startedGames: gone.length ? ids(gone) : 0 };
  }
  /* "NBA 8–10.8, NHL 6.5, MLB 3": each sport's bars in points, for copy; "" without per-side bars */
  function barsText(s) { s = s || marketSummary(); return (s.bars || []).map(function (b) { const lo = ptsLabel(b.min), hi = ptsLabel(b.max); return b.sport + " " + (lo === hi ? lo : lo + "–" + hi); }).join(", "); }
  /* one sentence for a board that left started games out, so nothing vanishes without a word */
  function startedNote(s) {
    s = s || marketSummary();
    if (!s.started) return "";
    return s.started + (s.started === 1 ? " side" : " sides") + " from " + s.startedGames + (s.startedGames === 1 ? " game that has started " : " games that have started ") + (s.started === 1 ? "is" : "are") + " off the board.";
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
      /* Held: a side past its bar in a game waiting on its news; its row says why under the game, and the chip's title when it is decided */
      const st = isPick ? "pick" : chipStatus(r);
      r = Object.assign({}, r, { pickId: isPick ? r.pickId : null });
      const tr = el("tr", { class: "mkt-" + st + (modelled ? "" : " mkt-nomodel") }, [
        el("td", {}, [el("span", { class: "badge badge-sport", "data-sport": r.sport, text: r.sport })]),
        el("td", {}, [el("span", { class: "mkt-game" }, [TM() ? TM().matchup(r, { size: "sm", abbr: false }) : null, el("span", { class: "mkt-game-text" }, [el("span", { class: "mkt-event", text: r.event }), el("span", { class: "mkt-start", text: startLabel(r) }), st === "held" ? el("span", { class: "mkt-why", text: "Held: " + heldWhy(r) }) : null])])]),
        el("td", { text: r.market }),
        el("td", {}, [el("strong", { text: r.pick })]),
        el("td", { class: "num mono", text: fmtOdds(r.odds) }),
        el("td", { text: r.book }),
        el("td", { class: "num mono", text: probText(r), title: modelled ? "Our probability, from the game data" + (typeof r.marketFair === "number" ? "; the market makes it " + pct(r.marketFair) + " (reference only)" : "") : "No model yet for this game" }),
        el("td", { class: "num mono", text: pct(impliedProb(r.odds)) }),
        modelled ? el("td", { class: "num mono " + (rowEdge(r) > 0 ? "edge-pos" : "edge-neg"), title: "Its bar " + barPts(r) + " points: " + pastWord(r) + (clearText(r) ? "; " + clearText(r) : "") }, [el("span", { class: "mkt-edge", text: signed(r.edge * 100, 1) }), hasOwnBar(r) ? el("span", { class: "mkt-bar", text: "bar " + barPts(r) }) : null]) : el("td", { class: "num muted", text: "No model yet" }),
        el("td", {}, [r.pickId ? el("a", { class: "badge badge-status badge-pick", href: (opts.pickHref || "picks.html#") + r.pickId, text: word("One") }) : el("span", { class: "badge badge-status badge-" + st, title: st === "held" ? heldNote(r) : null, text: statusLabel(st) })])
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
      el("p", { class: "pulse-lede" }, [el("strong", { text: s.markets + " markets" }), " priced across " + s.sports.join(", ") + ", each side given our probability from the game data and its own bar. " + (s.picks ? nWord(s.picks) + " on the board. " : "None is on the board" + (s.held ? "; " + s.held + " held past " + (s.held === 1 ? "its" : "their") + " bar" : "") + (s.watch ? "; " + s.watch + " on watch, at least halfway to their bar. " : ". ")) + (s.best ? "Closest: " + s.best.pick + " at " + fmtOdds(s.best.odds) + ", edge " + signed(s.best.edge * 100, 1) + ", " + barGap(s.best) + "." : "") + (s.unmodelled ? " " + s.unmodelled + (s.unmodelled === 1 ? " side has" : " sides have") + " no model yet." : "")]),
      el("ul", { class: "parlay-legs" }, top.map(function (p) { return el("li", {}, [el("span", { class: "leg-id" }, [TM() ? TM().matchup(p, { size: "sm", abbr: false }) : null, el("span", { class: "badge badge-sport", "data-sport": p.sport, text: p.sport })]), el("span", { class: "leg-pick" }, [el("strong", { text: p.pick }), meta([p.event, startLabel(p)], "leg-event")]), el("span", { class: "mono leg-price", text: fmtOdds(p.odds) }), el("span", { class: "badge badge-status badge-" + p.status, text: statusLabel(p.status) })]); })),
      el("div", { class: "pick-foot" }, [el("span", { text: s.generatedAt ? "Priced " + clockET(s.generatedAt.getTime()) : "" }), el("a", { class: "flip-btn", href: "picks.html#market", text: "Open the market board" })])
    ]);
  }

  /* ---------- live status slot: js/live.js fills these once games start ---------- */
  function liveSlot(id) { return el("span", { class: "live-slot", "data-live": id }); }

  /* ---------- in progress and results: a pick whose game has started moves here instead of vanishing ---------- */
  /* game day first, then live, awaiting a result, graded; within each, worth a bet first, then likeliest */
  function playedCmp(a, b) { return dayCmp(a, b) || (STATE_RANK[gameState(a)] - STATE_RANK[gameState(b)]) || ((edgeNum(b) > 0) - (edgeNum(a) > 0)) || (probOf(b) - probOf(a)) || (edgeNum(b) - edgeNum(a)); }
  function playedPicks() { return (((window.PICKS_DATA || {}).picks) || []).filter(function (p) { return p && p.id && !isOpen(p); }).sort(playedCmp); }
  function playedRow(p, rank) {
    const st = gameState(p), graded = st === "final", t = startMs(p), u = Number(p.units);
    const posted = el("span", {}, [el("span", { class: "mono", text: fmtOdds(p.odds) }), p.book ? " at " + p.book : ""]);
    const result = graded
      ? [scoreText(p) ? el("span", { class: "played-score", text: "Final " + scoreText(p) }) : null,
         unitsText(p) ? el("span", { class: "mono played-units" + (u > 0 ? " pos" : u < 0 ? " neg" : ""), text: unitsText(p) }) : resultWord(p) === "Void" ? el("span", { class: "played-note", text: "No action, stake back" }) : null]
      : [st === "awaiting" ? el("span", { class: "played-note", text: "Graded from the final score at the next run" }) : null, liveSlot(p.id)];
    return el("article", { class: "played", "data-id": p.id, "data-sport": p.sport, "data-state": st }, [
      el("div", { class: "played-id" }, [rankChip(rank, true), stateChip(p), el("span", { class: "badge badge-sport", "data-sport": p.sport, text: p.sport })]),
      el("div", { class: "played-pick" }, [
        TM() ? TM().matchup(p, { size: "sm", abbr: false }) : null,
        el("strong", { text: p.pick }),
        meta([p.event, p.market, posted, Number.isFinite(t) ? "Started " + clockET(t) : startLabel(p)], "leg-event")
      ]),
      el("div", { class: "played-result" }, result),
      el("div", { class: "played-actions" }, [el("button", { type: "button", class: "flip-btn", "data-breakdown": p.id, text: "Breakdown" })])
    ]);
  }
  /* counts for the home page's "Earlier today" strip: 1 live, 1 awaiting a result, 2 won, 1 lost (+0.74u) */
  function playedSummary() {
    const list = playedPicks(), c = {};
    let units = 0, graded = 0;
    list.forEach(function (p) { const k = stateKey(p); c[k] = (c[k] || 0) + 1; if (gameState(p) === "final" && p.units != null && Number.isFinite(Number(p.units))) { units += Number(p.units); graded++; } });
    const rec = [c.won ? c.won + " won" : null, c.lost ? c.lost + " lost" : null, c.push ? c.push + (c.push === 1 ? " push" : " pushes") : null, c.void ? c.void + " void" : null, c.final ? c.final + " final" : null].filter(Boolean);
    const parts = [c.live ? c.live + " live" : null, c.awaiting ? c.awaiting + " awaiting a result" : null, rec.length ? rec.join(", ") + (graded ? " (" + signed(Math.round(units * 100) / 100, 2) + "u)" : "") : null].filter(Boolean);
    return { list: list, counts: c, units: units, graded: graded, parts: parts };
  }

  /* ---------- posted against now: the price we logged, the best price now when it moved, and the worst price still worth a bet ---------- */
  function hasMoved(p) { const m = p && p.movement; return !!m && m.currentOdds != null && Number.isFinite(Number(m.currentOdds)) && Number(m.currentOdds) !== 0 && (Number(m.currentOdds) !== Number(p.odds) || (!!m.currentBook && !!p.book && m.currentBook !== p.book)); }
  function valueTo(p) { const v = Number(p && p.valueTo); return p && p.valueTo != null && Number.isFinite(v) && v !== 0 ? v : null; }
  /* ---------- the price that would make a side a lean (2026-11-10) ----------
     A side short of its bar clears it once the best price implies no more than our probability less the bar. That is the
     pipeline's valueTo (scripts/update-data.js), the number a posted lean shows as "Clears its bar to -133", mirrored
     here step for step so the two agree (a behaviour check runs both on the same inputs): the American price whose
     implied probability is modelProb − bar (the floor for a side with no bar of its own), as a whole number on the side
     that still clears (-118.4 -> -118, +134.2 -> +135; even money is +100). null when that probability is not strictly
     between 0 and 1, so nothing is printed. */
  function clearPrice(modelProb, bar) {
    if (modelProb == null || modelProb === "") return null;
    const p = Number(modelProb) - (Number(bar) > 0 ? Number(bar) : floorBar());
    if (!Number.isFinite(p) || p <= 0 || p >= 1) return null;
    const exact = p >= 0.5 ? -100 * p / (1 - p) : 100 * (1 - p) / p;
    const whole = Math.ceil(exact - 1e-9); /* the epsilon keeps an exact whole price (p = 0.6 -> -150) from rounding past it */
    return whole === -100 ? 100 : whole; /* even money is written +100 */
  }
  /* for a side with a model that is short of its bar: the price that clears it; null for a side past its bar, with no model, or with no finite answer */
  function clearFor(x) { const past = pastOf(x); return hasModel(x) && Number.isFinite(past) && past < 0 ? clearPrice(x.modelProb, hasOwnBar(x) ? x.bar : null) : null; }
  /* "clears its bar from +117", for prose and titles; "" when there is nothing to say */
  function clearText(x) { const v = clearFor(x); return v == null ? "" : "clears its bar from " + fmtOdds(v); }
  /* the line on a card that is not a lean, where a lean's "Clears its bar to" sits: "Clears its bar from +117 | best now +104".
     Open games only: a started game's price is closed */
  function clearLine(p, cls) {
    if (!p || !p.isMarket || !isOpen(p)) return null;
    const v = clearFor(p);
    if (v == null) return null;
    return meta([
      el("span", { class: "price-worth", title: "The price at which our probability would clear this side’s own bar: it implies " + pct(impliedProb(v), 1) + ", our " + pct(p.modelProb) + " less the bar of " + barPts(p) + " points" }, ["Clears its bar from ", el("span", { class: "mono", text: fmtOdds(v) })]),
      el("span", { class: "price-now" }, ["best now ", el("span", { class: "mono", text: fmtOdds(p.odds) })])
    ], "price-value price-clear" + (cls ? " " + cls : ""));
  }
  /* the market-line parts on a card: "Spread | -110 | DraftKings", or "Spread | Posted -110 at DraftKings" once the price moved (the price now goes on the line under it) */
  function priceParts(p) {
    if (!hasMoved(p)) return [el("span", { class: "mono", text: fmtOdds(p.odds) }), p.book || null];
    return [el("span", { class: "price-posted" }, ["Posted ", el("span", { class: "mono", text: fmtOdds(p.odds) }), p.book ? " at " + p.book : ""])];
  }
  /* the line under it: "now -125 at FanDuel | Worth a bet to -118"; a price now past the worth-a-bet price is marked */
  function valueLine(p, cls) {
    if (!p || p.isMarket) return null;
    /* a pick that slipped below its bar has no worth-a-bet price: valueTo is from the posted probability, which the
       last check no longer holds (the chip says so) */
    const chip = standingChip(p), vt = chip ? null : valueTo(p), moved = hasMoved(p), m = p.movement;
    if (vt == null && !moved && !chip) return null;
    const past = moved && vt != null && decimalOdds(m.currentOdds) < decimalOdds(vt);
    const line = meta([
      moved ? el("span", { class: "price-now" + (past ? " price-past" : ""), title: (past ? "Past the worst price at which our probability still clears its bar. " : "") + (m.checkedAt ? "Best price at the check " + clockET(Date.parse(m.checkedAt)) : "") || null }, ["now ", el("span", { class: "mono", text: fmtOdds(m.currentOdds) }), m.currentBook ? " at " + m.currentBook : ""]) : null,
      vt != null ? el("span", { class: "price-worth", title: "The worst price at which our probability still clears this " + word("one") + "’s bar" }, ["Clears its bar to ", el("span", { class: "mono", text: fmtOdds(vt) })]) : null
    ], "price-value" + (cls ? " " + cls : ""));
    /* locked: a pick a later check put below its bar, or out of edge, stays on the card and says so (a chip, not a meta part) */
    if (chip) line.appendChild(chip);
    return line;
  }

  /* ---------- the same team's moneyline beside a spread lean (owner ask, 2026-11-05) ----------
     Likeliest first puts a +1.5 at −130 on top; the reader should see what the same team pays to win outright. For a
     lean on a spread, puck line or run line, the card front and the breakdown show that team's moneyline from the last
     pricing run (MARKET_DATA): the best price, its book and our probability. No row for it, nothing shown. */
  /* the team on a spread side: the outcome's name, else the pick text without its number ("Vancouver Canucks +1.5") */
  function spreadTeam(p) {
    if (!p || p.marketKey !== "spreads") return "";
    const o = p.outcome && p.outcome.name;
    if (o) return String(o);
    const m = String(p.pick || "").match(/^(.*\S)\s+[+-]?\d+(?:\.\d+)?$/);
    return m ? m[1] : "";
  }
  /* a market row on the same game as a pick: the event id when both carry one; a pipeline pick's id starts with the first
     ten characters of its event's id; else the same event label at the same start */
  function sameGame(r, p) {
    if (r.eventId != null && p.eventId != null) return String(r.eventId) === String(p.eventId);
    if (r.eventId != null && p.id && String(p.id).indexOf(String(r.eventId).slice(0, 10) + "-") === 0) return true;
    return !!r.event && r.event === p.event && (!r.commence || !p.commence || Date.parse(r.commence) === Date.parse(p.commence));
  }
  function moneylineFor(p) {
    const team = spreadTeam(p);
    if (!team) return null;
    return marketData().rows.find(function (r) {
      return r && r.marketKey === "h2h" && sameGame(r, p) && ((r.outcome && r.outcome.name === team) || r.pick === team + " ML");
    }) || null;
  }
  /* the line: "Moneyline +185 at BetRivers | To hit 42.2%"; only while the game can still be bet (a started game's
     prices are closed, so nothing on it looks bettable) */
  function moneylineLine(p, cls) {
    if (!isOpen(p)) return null;
    const r = moneylineFor(p);
    if (!r || !Number.isFinite(Number(r.odds)) || Number(r.odds) === 0) return null;
    const line = meta([
      el("span", {}, ["Moneyline ", el("span", { class: "mono", text: fmtOdds(r.odds) }), r.book ? " at " + r.book : ""]),
      hasModel(r) ? el("span", {}, ["To hit ", el("span", { class: "mono", text: pct(r.modelProb) })]) : null
    ], "pick-ml" + (cls ? " " + cls : ""));
    line.title = "The same team to win outright: the best moneyline price at the last pricing run" + (hasModel(r) ? " and our probability for it, from the game data" : "; no model yet for this game");
    return line;
  }

  /* ---------- pick card ---------- */
  /* sample data files set sample:true; real data from scripts/update-data.js sets it false */
  function isSample() { const d = window.PICKS_DATA; return !d || d.sample !== false; }

  /* a pick card is two faces: numbers on the front, the "why" on the back; it flips in 3D */
  function pickCard(p, opts) {
    opts = opts || {};
    const modelled = hasModel(p), ours = modelled ? Number(p.modelProb) : 0, imp = impliedProb(p.odds);
    const confClass = p.isMarket ? "badge badge-status badge-" + (p.status || "none") : "badge badge-conf-" + String(p.confidence).toLowerCase();
    const factors = Array.isArray(p.factors) ? p.factors : [];
    /* a market card is not a lean (the never-empty fallbacks, the watchlist): its link says so, as the game page does */
    const flipBtn = el("button", { type: "button", class: "flip-btn", "aria-expanded": "false", text: !p.isMarket ? "Why this " + word("one") : p.status === "held" ? "Why it is held" : "Why no " + word("one") });
    const backBtn = el("button", { type: "button", class: "flip-btn", text: "Back to numbers" });
    const front = el("div", { class: "pick-face pick-front" }, [
      el("div", { class: "pick-head" }, [
        el("span", { class: "pick-head-left" }, [rankChip(opts.rank), el("span", { class: "badge badge-sport", "data-sport": p.sport, text: p.sport })]),
        el("span", { class: "pick-head-right" }, [
          isSample() ? el("span", { class: "badge badge-sample", text: "Sample" }) : null,
          isPlayOfDay(p.id) ? el("span", { class: "badge badge-potd", text: word("ofDay") }) : null,
          el("span", { class: confClass, text: tierLabel(p.confidence) })
        ])
      ]),
      el("div", {}, [
        TM() ? TM().matchup(p) : null,
        el("div", { class: "pick-event", text: p.event }),
        el("h3", { class: "pick-selection", text: p.pick }),
        meta([p.market].concat(priceParts(p)), "pick-market"),
        valueLine(p),
        clearLine(p),
        moneylineLine(p),
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
      barLine(p),
      heldLine(p),
      offLine(p),
      flagLine(p),
      /* the watchlist lists one side a game: the others on watch are a link away, on the game page */
      opts.more ? el("p", { class: "pick-note pick-more" }, [el("a", { href: "game.html?id=" + encodeURIComponent(p.eventId), text: "+" + opts.more + (opts.more === 1 ? " more side on watch in this game" : " more sides on watch in this game") })]) : null,
      el("div", { class: "pick-foot" }, [
        el("span", {}, [meta([p.league, startLabel(p)]), liveSlot(p.id)]),
        /* a game that has started is never offered: its state chip stands where the parlay button was */
        el("span", { class: "pick-actions" }, [p.isMarket ? null : isOpen(p) ? parlayButton(p.id) : stateChip(p), flipBtn])
      ])
    ]);
    /* the back is sized to the front: its middle scrolls when the reasons and faces run longer, and fades at the foot while
       there is more below */
    const backBody = el("div", { class: "pick-back-body" }, [
      el("h3", { class: "pick-selection", text: p.pick }),
      el("p", { class: "pick-rationale", text: p.rationale }),
      factors.length ? el("ul", { class: "pick-factors" }, factors.map(function (f) { return el("li", { text: f }); })) : null,
      TM() ? TM().faces(p, { perTeam: 3, px: 40 }) : null
    ]);
    function moreBelow() { backBody.classList.toggle("has-more", backBody.scrollHeight - backBody.scrollTop - backBody.clientHeight > 2); }
    backBody.addEventListener("scroll", moreBelow, { passive: true });
    const back = el("div", { class: "pick-face pick-back", "aria-hidden": "true" }, [
      el("div", { class: "pick-head" }, [
        el("span", { class: "eyebrow", text: p.isMarket ? "Where the market sits" : "Why the model likes it" }),
        el("span", { class: confClass, text: tierLabel(p.confidence) })
      ]),
      backBody,
      el("div", { class: "pick-foot" }, [
        p.isMarket ? el("a", { class: "flip-btn bd-btn", href: "picks.html#market", text: "Market board" }) : el("button", { type: "button", class: "flip-btn bd-btn", "data-breakdown": p.id, text: "Full breakdown" }),
        backBtn
      ])
    ]);
    const card = el("article", { class: "card pick" + (p.isMarket ? " market-card" : ""), "data-id": p.id, "data-sport": p.sport, "data-event": p.isMarket && p.eventId != null ? String(p.eventId) : null, "data-tilt": "" }, [
      el("div", { class: "pick-inner" }, [front, back])
    ]);
    if (TM()) TM().tint(card, p);
    function setFlipped(f) {
      card.classList.toggle("flipped", f);
      flipBtn.setAttribute("aria-expanded", String(f));
      back.setAttribute("aria-hidden", String(!f));
      front.setAttribute("aria-hidden", String(f));
      if (f) moreBelow();
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
      el("td", { text: startLabel(p) }),
      el("td", { text: p.market }),
      el("td", {}, [el("strong", { text: p.pick }), flagOf(p) ? el("span", { class: "row-note" }, [flagChip(p), el("span", { text: flagNote(p) })]) : null]),
      el("td", { class: "num", text: fmtOdds(p.odds) }),
      el("td", { class: "num", text: probText(p) }),
      el("td", { class: "num", text: pct(impliedProb(p.odds)) }),
      el("td", { class: "num", title: hasModel(p) ? "Bar " + barPts(p) + " points: " + pastWord(p) : null, text: edgeText(p) }),
      el("td", {}, [el("span", { class: "badge badge-conf-" + String(p.confidence).toLowerCase(), text: tierLabel(p.confidence) })]),
      el("td", { class: "num" }, [(function () { const s = lineShop(p); return s.books ? el("span", { class: "mono" + (s.sole ? " shop-sole" : ""), title: shopSummary(p), text: s.clears + "/" + s.books }) : el("span", { text: "—" }); })()]),
      el("td", {}, [isOpen(p) ? parlayButton(p.id) : stateChip(p)])
    ]);
  }

  function picksTable(picks) {
    const head = el("tr", {}, ["#", "Sport", "Event", "Start", "Market", word("One"), "Odds", "To hit", "Implied", "Edge", "Confidence", "Books", "Parlay"]
      .map(function (h, i) { return el("th", { scope: "col", class: (i >= 6 && i <= 9) || i === 11 || i === 0 ? "num" : "", title: i === 0 ? "Rank by our probability from game data, likeliest first" : i === 7 ? "Our probability for the side, from the game data" : i === 11 ? "Books whose price still clears the " + word("one") + "’s own bar, out of every book priced on this line" : null, text: h }); }));
    const tbody = el("tbody", {}, picks.map(pickRow));
    return el("div", { class: "table-wrap", tabindex: "0", role: "region", "aria-label": word("Many") + " table" }, [el("table", { class: "data" }, [el("thead", {}, [head]), tbody])]);
  }

  function sortByEdge(picks) {
    return (picks || []).filter(isValidPick).sort(function (a, b) { return edgeNum(b) - edgeNum(a); });
  }
  /* the site's order (owner rule): today's games before tomorrow's; within a day, sides with a positive edge first, then everything else; within each tier the likeliest to hit first, by our probability from the game data; edge breaks ties; a side with no model goes last */
  /* the tiers within a day: worth a bet now (2), a locked pick that has slipped under its bar at the last check (1), the
     rest (0). A slipped pick stays on the card, graded at its posted price, but never outranks a pick that still clears */
  function worthTier(p) { return edgeNum(p) > 0 ? (standingOf(p) ? 1 : 2) : 0; }
  function worthFirst(a, b) { return dayCmp(a, b) || (worthTier(b) - worthTier(a)) || (probOf(b) - probOf(a)) || (edgeNum(b) - edgeNum(a)); }
  function sortByProb(picks) {
    return (picks || []).filter(isValidPick).sort(worthFirst);
  }
  /* the rank chip: "#1 · Likeliest" on the top card, "#n" below it */
  /* a game named by its two abbreviations ("MIA @ UTAH") where both are known; the full event otherwise */
  function eventShort(p) {
    if (!p) return "";
    const who = p.player;
    if (who && who.teamAbbr && who.oppAbbr) return who.home ? who.oppAbbr + " @ " + who.teamAbbr : who.teamAbbr + " @ " + who.oppAbbr;
    const a = TM() ? TM().teamFor(p, "away") : null, h = TM() ? TM().teamFor(p, "home") : null;
    if (!a || !h || !a.abbr || !h.abbr) return p.event || "";
    return / vs\.? /.test(p.event || "") ? h.abbr + " vs. " + a.abbr : a.abbr + " @ " + h.abbr;
  }
  function rankChip(n, short) {
    if (!n) return null;
    return el("span", { class: "rank" + (n === 1 ? " rank-top" : ""), title: n === 1 ? "Likeliest to hit on this board, by our probability from game data" : "Rank " + n + " by our probability from game data", text: n === 1 && !short ? "#1 Likeliest" : "#" + n });
  }

  /* ---------- play of the day ---------- */
  function isPlayOfDay(id) { const d = window.PICKS_DATA; return !!(d && d.playOfDay && d.playOfDay.id === id); }
  /* ---------- any play: a game lean or a player prop (owner ask, 2026-11-11) ----------
     The play and the parlay of the day are chosen from every play (js/plays.js, scripts/of-day.js), so a card can be a
     player prop: kind "prop" with player, stat, side and line. A prop has no breakdown dialog, no live score slot and no
     slip button; it links to its player on the props board. */
  function isPropPlay(p) { return !!p && p.kind === "prop" && !!p.player; }
  function propHref(p) { return "props.html?p=" + encodeURIComponent(p.player.id) + (p.stat ? "&stat=" + encodeURIComponent(p.stat) : ""); }
  function capFirst(v) { v = String(v == null ? "" : v); return v.charAt(0).toUpperCase() + v.slice(1); }
  /* "Under 7.5 rebounds": a prop's side, line and stat, the heading under the player's name */
  function propSel(p) { return capFirst(p.side) + " " + p.line + " " + String(p.statLabel || p.market || "").toLowerCase(); }
  function frontBadge() { return el("span", { class: "badge badge-front", title: "The front-runner so far. The play and the parlay of the day lock at the afternoon run, once game lines and prop lines are both in.", text: "Not final" }); }
  /* the lock under a play or parlay of the day. Before the lock run the card is the front-runner and says when it
     locks; after it, when it locked. opts.front, opts.lockAt (ms) */
  function lockLine(p, opts) {
    opts = opts || {};
    if (opts.front) {
      const at = Number(opts.lockAt), known = Number.isFinite(at) && at > 0, due = known && now() >= at;
      return el("p", { class: "potd-lock is-front" }, [el("strong", { text: "Front-runner, not final." }), due ? " The lock run is due: it locks when that run lands, and is never swapped after." : " It locks " + (known ? aboutET(at) : "at the " + runClock(1) + " run") + ", once game lines and prop lines are both in, and is never swapped after."]);
    }
    const t = Date.parse((p && p.lockedAt) || "");
    return Number.isFinite(t) ? el("p", { class: "potd-lock", text: "Locked " + clockET(t) + ". One a day, never swapped." }) : null;
  }
  /* the slim bar under a play's numbers: fill = our chance, tick = what the price implies, hairline = a coin flip */
  function probMeter(prob, odds, cls) {
    const imp = impliedProb(odds), w = Math.max(0, Math.min(100, prob * 100)), t = Math.max(0, Math.min(100, imp * 100));
    return el("div", { class: "prob" + (cls ? " " + cls : ""), role: "img", "aria-label": "To hit " + pct(prob) + "; the price implies " + pct(imp), title: "To hit " + pct(prob) + " · price implies " + pct(imp) + " · 50% line is a coin flip" }, [
      el("div", { class: "prob-bar" }, [el("span", { class: "prob-fill", style: "width:" + w.toFixed(1) + "%" }), el("span", { class: "prob-tick", style: "left:" + t.toFixed(1) + "%" })])
    ]);
  }
  /* a play from EdgeLinePlays (kind, prob, stated, tier, src) in the published shape the cards read: a lean is its pick
     on the board, a prop the shape scripts/of-day.js publicProp writes. check: PROPS_DATA.results.check, when there is one */
  function playAsPick(play, check) {
    if (!play) return null;
    if (play.kind !== "prop") return Object.assign({}, play.src, { kind: "lean" });
    const PL = window.EdgeLinePlays, row = check && (check[play.league] || check.all);
    return { kind: "prop", id: play.id, sport: play.sport, league: play.league, sportKey: play.sportKey, event: play.event, home: play.home, away: play.away, gameId: play.gameId, commence: play.commence,
      market: play.market, pick: play.pick, odds: play.odds, book: play.book, prices: play.prices || {}, modelProb: play.prob, statedProb: play.stated,
      keep: PL ? PL.keepFor(play.league, check) : null, checkedOn: row && row.n ? row.n : 0, ev: play.ev, confidence: play.tier, basis: "game",
      player: play.player, stat: play.stat, statLabel: play.statLabel, statShort: play.statShort, side: play.side, line: play.line, l10: play.l10 || null, proj: play.proj == null ? null : play.proj, reasons: play.reasons || [],
      status: "pending", started: false, result: null, units: null, actual: null, score: null };
  }
  /* EdgeLinePlays.parlay's answer ({ book, legs: [play, play], legPrices, odds, fairProb, ev }) in the published parlay shape */
  function frontParlay(par) {
    if (!par) return null;
    return { id: "parlay-front", book: par.book, odds: par.odds, decimal: par.decimal, fairProb: par.fairProb, ev: par.ev, status: "pending", result: null, units: null,
      legs: par.legs.map(function (x, i) {
        const leg = { id: x.id, kind: x.kind === "prop" ? "prop" : "lean", pick: x.pick, event: x.event, sport: x.sport, price: par.legPrices[i], commence: x.commence || null, started: false, result: null };
        if (x.kind === "prop") Object.assign(leg, { league: x.league, sportKey: x.sportKey, home: x.home, away: x.away, gameId: x.gameId, player: x.player, stat: x.stat, statShort: x.statShort, side: x.side, line: x.line, modelProb: x.prob });
        return leg;
      }) };
  }
  /* the play of the day when it is a player prop: the player, the side and line, the chance as checked against the
     props' own graded record, and the reasons from the props board */
  function propPlayCard(p, opts) {
    const st = gameState(p), open = st === "upcoming" || st === "soon", pl = p.player, T = TM();
    const prob = Number(p.modelProb), imp = impliedProb(p.odds), ev = p.ev == null ? prob * decimalOdds(p.odds) - 1 : Number(p.ev), statWord = String(p.statLabel || p.market || "").toLowerCase();
    const stated = Number(p.statedProb), n = Number(p.checkedOn) || 0;
    const why = !Number.isFinite(stated) || Math.abs(stated - prob) < 0.0005 ? "Graded on game data: this player's own games, never another book's price."
      : "The props board gives this side " + pct(stated) + ". " + (n ? "Graded props have landed nearer a coin flip than the board says, so it counts here at " + pct(prob) + ", checked against " + n.toLocaleString("en-US") + " graded props." : "Props have no graded record to check against yet, so only part of that counts: " + pct(prob) + " here.");
    const status = open ? [startLabel(p)] : [stateChip(p), st === "final"
      ? meta([p.actual != null ? "Finished on " + p.actual + " " + statWord : null, p.status === "void" && p.voidReason ? capFirst(p.voidReason) : null, unitsText(p) || null], "potd-result")
      : meta([Number.isFinite(startMs(p)) ? "Started " + clockET(startMs(p)) : "Started"], "potd-result")];
    const card = el("article", { class: "card potd potd-prop" + (opts.front ? " potd-front" : ""), "data-sport": p.sport, "data-state": st, "data-kind": "prop", "data-tilt": "" }, [
      el("div", { class: "pick-head" }, [
        el("span", { class: "eyebrow", text: word("ofDay") }),
        el("span", { class: "pick-head-right" }, [opts.front ? frontBadge() : null, el("span", { class: "badge badge-kind", text: "Player prop" }), el("span", { class: "badge badge-sport", "data-sport": p.sport, text: p.sport })])
      ]),
      el("div", { class: "potd-player" }, [
        T ? T.face(p.sportKey, pl, 64) : null,
        el("div", { class: "potd-player-id" }, [el("span", { class: "potd-player-name", text: pl.name }), meta([pl.teamAbbr || null, pl.pos || null, pl.oppAbbr ? (pl.home ? "vs " : "at ") + pl.oppAbbr : null], "potd-player-sub")])
      ]),
      el("h3", { class: "potd-selection", text: propSel(p) }),
      el("div", { class: "potd-event", text: p.event }),
      meta([p.statLabel || p.market, el("span", { class: "mono", text: fmtOdds(p.odds) }), p.book || null], "potd-line"),
      el("div", { class: "pick-metrics potd-metrics" }, [
        el("div", { class: "pick-metric", title: "The props board's chance for this side, checked against how graded props have actually finished" }, [el("div", { class: "k", text: "To hit" }), el("div", { class: "v", text: pct(prob) })]),
        el("div", { class: "pick-metric" }, [el("div", { class: "k", text: "Edge" }), el("div", { class: "v edge", text: signed((prob - imp) * 100, 1) + "%" })]),
        el("div", { class: "pick-metric" }, [el("div", { class: "k", text: "EV / unit" }), el("div", { class: "v edge", text: signed(ev * 100, 1) + "%" })])
      ]),
      probMeter(prob, p.odds),
      el("p", { class: "pick-rationale", text: why }),
      (p.reasons || []).length ? el("ul", { class: "potd-reasons" }, p.reasons.slice(0, 3).map(function (r) { return el("li", { text: String(r) }); })) : null,
      lockLine(p, opts),
      el("div", { class: "pick-foot" }, [
        el("span", { class: "potd-state" }, status),
        el("span", { class: "pick-actions" }, [el("a", { class: "flip-btn", href: propHref(p), text: "Open on the props board" })])
      ])
    ]);
    /* the glow is the player's own team */
    if (T) T.tint(card, Object.assign({}, p, { pick: pl.home ? p.home : p.away, outcome: null }));
    return card;
  }
  /* opts.front: the front-runner before the lock (a "Not final" badge and the lock line); opts.lockAt: the lock, in ms */
  function potdCard(p, opts) {
    opts = opts || {};
    if (!p) {
      /* nothing cleared the bar: show the closest market instead, labelled as such */
      const alt = marketRows({ limit: 1, oneSidePerMarket: true, byPast: true })[0];
      if (alt) {
        const past = pastOf(alt), why = !Number.isFinite(past) ? "There is no model on the board yet, so this is the first market priced, not a " + word("one") + "." : past < 0 ? "Nothing is on the board yet, so this is the nearest miss on our numbers: " + (-past * 100).toFixed(1) + " points short of " + barName(alt) + ". Not a " + word("one") + "." : isHeld(alt) ? "Nothing is on the board yet. This side clears " + barName(alt) + ", but its game is held: " + heldWhy(alt) + ". " + heldWhen(alt) + " Not a " + word("one") + " until then."
          : "Nothing is on the board yet. This side was past " + barName(alt) + " at the last pricing but was not posted, so it is not a " + word("one") + ".";
        const c = potdCard(Object.assign({}, alt, { _eyebrow: "Closest to the bar", _note: why + " The " + word("ofDay").toLowerCase() + " locks with the " + runClock(1) + " run." })); c.classList.add("potd-market"); return c;
      }
      return el("div", { class: "card empty", text: "No " + word("ofDay").toLowerCase() + " yet. It locks with the " + runClock(1) + " run, from every game " + word("one") + " and player prop with an edge at its price." });
    }
    if (isPropPlay(p)) return propPlayCard(p, opts);
    const modelled = hasModel(p), st = gameState(p), open = st === "upcoming" || st === "soon";
    /* chosen once a day and kept: once its game starts it shows where it stands, never an add button */
    const status = open ? [startLabel(p)] : [stateChip(p), st === "final" ? meta([scoreText(p) ? "Final " + scoreText(p) : null, unitsText(p) || null], "potd-result") : meta([Number.isFinite(startMs(p)) ? "Started " + clockET(startMs(p)) : "Started"], "potd-result")];
    const card = el("article", { class: "card potd" + (opts.front ? " potd-front" : ""), "data-sport": p.sport, "data-state": st, "data-kind": p.isMarket ? "market" : "lean", "data-tilt": "" }, [
      el("div", { class: "pick-head" }, [
        el("span", { class: "eyebrow", text: p._eyebrow || word("ofDay") }),
        el("span", { class: "pick-head-right" }, [opts.front && !p.isMarket ? frontBadge() : null, p.isMarket ? el("span", { class: "badge badge-status badge-" + p.status, text: statusLabel(p.status) }) : null, el("span", { class: "badge badge-sport", "data-sport": p.sport, text: p.sport })])
      ]),
      TM() ? TM().matchup(p, { size: "lg" }) : null,
      el("div", { class: "potd-event", text: p.event }),
      el("h3", { class: "potd-selection", text: p.pick }),
      meta([p.market].concat(priceParts(p)), "potd-line"),
      valueLine(p),
      moneylineLine(p),
      el("div", { class: "pick-metrics potd-metrics" }, [
        el("div", { class: "pick-metric", title: "Our probability for this side, from the game data; not other books' prices" }, [el("div", { class: "k", text: "To hit" }), el("div", { class: "v", text: probText(p) })]),
        el("div", { class: "pick-metric" }, [el("div", { class: "k", text: "Edge" }), el("div", { class: modelled ? "v edge" : "v muted", text: edgeText(p) })]),
        el("div", { class: "pick-metric" }, [el("div", { class: "k", text: "EV / unit" }), el("div", { class: modelled ? "v edge" : "v muted", text: modelled ? signed((p.ev == null ? p.modelProb * decimalOdds(p.odds) - 1 : p.ev) * 100, 1) + "%" : "—" })])
      ]),
      barLine(p),
      flagLine(p),
      el("p", { class: "pick-rationale", text: p._note || p.rationale }),
      p.isMarket ? null : lockLine(p, opts),
      el("div", { class: "pick-foot" }, [
        el("span", { class: "potd-state" }, status.concat([st === "final" || p.isMarket ? null : liveSlot(p.id)])),
        el("span", { class: "pick-actions" }, [!open || p.isMarket ? null : parlayButton(p.id), p.isMarket ? el("a", { class: "flip-btn", href: "picks.html#market", text: "Market board" }) : el("button", { type: "button", class: "flip-btn", "data-breakdown": p.id, text: "Full breakdown" })])
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
    /* a leg whose game has started can never be on a ticket, nor a locked pick that slipped under its bar at the last
       check: its posted probability is no longer ours, so a ticket priced on it would overstate the chance to hit */
    const legsAll = (picks || []).filter(p => isOpen(p) && !standingOf(p) && p.prices && Object.keys(p.prices).length && Number.isFinite(Number(p.modelProb)));
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
  /* a leg the slip can price: its pick is on the board and its game has not started */
  function slipLeg(id) { const p = findPick(id); return p && !isPropPlay(p) && isOpen(p) ? p : null; }
  const slip = {
    get: function () { try { return JSON.parse(localStorage.getItem(SLIP_KEY) || "[]"); } catch (e) { return []; } },
    set: function (ids) { try { localStorage.setItem(SLIP_KEY, JSON.stringify(ids)); } catch (e) { /* ignore */ } syncButtons(); document.dispatchEvent(new CustomEvent("slipchange", { detail: ids })); },
    has: function (id) { return slip.get().indexOf(id) !== -1; },
    /* removing always works; adding a pick whose game has started does not */
    toggle: function (id) { const ids = slip.get(); const i = ids.indexOf(id); if (i === -1) { if (findPick(id) && !slipLeg(id)) { checkStates(true); return; } ids.push(id); } else ids.splice(i, 1); slip.set(ids); },
    clear: function () { slip.set([]); },
    /* the legs that can still be bet, and the ones that cannot (started, or gone from the board) */
    open: function () { return slip.get().filter(id => !!slipLeg(id)); },
    closed: function () { return slip.get().filter(id => !slipLeg(id)); }
  };
  function parlayButton(id) {
    const on = slip.has(id);
    return el("button", { type: "button", class: "add-parlay", "data-id": id, "aria-pressed": String(on), text: on ? "In parlay" : "Add to parlay" });
  }
  function syncButtons() {
    const ids = slip.get(), live = slip.open();
    document.querySelectorAll(".add-parlay[data-id]").forEach(function (b) { const on = ids.indexOf(b.getAttribute("data-id")) !== -1; b.setAttribute("aria-pressed", String(on)); b.textContent = on ? "In parlay" : "Add to parlay"; });
    /* the floating link counts only legs that can still be bet */
    const link = document.querySelector(".slip-link");
    if (link) { link.hidden = !live.length; const n = link.querySelector("strong"); if (n) n.textContent = String(live.length); }
  }
  document.addEventListener("click", function (e) {
    const b = e.target.closest && e.target.closest(".add-parlay[data-id]");
    if (b) slip.toggle(b.getAttribute("data-id"));
  });
  document.addEventListener("DOMContentLoaded", syncButtons);

  function parlayCard(par, opts) {
    opts = opts || {};
    if (!par) return pulseCard({ title: "No parlay yet: the market right now", emptyText: "No " + word("parlayOfDay").toLowerCase() + " yet. It needs two " + word("many") + " or player props from different games, each with an edge at the same book." });
    /* each leg read from its pick on the board, so a leg whose game has started says so */
    const legPick = par.legs.map(legAsPick), begun = legPick.filter(p => !isOpen(p)).length;
    /* a prop leg has no pick on the board: no breakdown dialog and no place in the builder */
    const leanIds = par.legs.filter(l => !isPropPlay(l)).map(l => l.id), hasProp = leanIds.length < par.legs.length;
    const status = par.status === "void" ? "Void: a leg was called off" : par.result ? "Result: " + par.result : begun ? (begun === par.legs.length ? "Every leg has started" : begun + " of " + par.legs.length + " legs started") : "All legs ahead";
    return el("article", { class: "card parlay" + (begun ? " parlay-begun" : "") + (opts.front ? " potd-front" : ""), "data-tilt": "" }, [
      el("div", { class: "pick-head" }, [
        el("span", { class: "eyebrow", text: opts.title || word("parlayOfDay") }),
        el("span", { class: "pick-head-right" }, [opts.front ? frontBadge() : null, opts.tag ? el("span", { class: "badge badge-potd", text: opts.tag }) : null, el("span", { class: "badge badge-strong", text: par.legs.length + " legs" })])
      ]),
      el("ul", { class: "parlay-legs" }, par.legs.map(function (l, i) {
        const lp = legPick[i], lst = gameState(lp), prop = isPropPlay(l);
        return el("li", { "data-state": lst, "data-kind": prop ? "prop" : "lean" }, [
          el("span", { class: "leg-id" }, [!TM() ? null : prop ? TM().face(l.sportKey, l.player, 28) : TM().matchup(l, { size: "sm", abbr: false }), el("span", { class: "badge badge-sport", "data-sport": l.sport, text: l.sport })]),
          el("span", { class: "leg-pick" }, [prop ? el("a", { class: "leg-prop", href: propHref(l), title: "Open on the props board" }, [el("strong", { text: l.pick })]) : el("strong", { text: l.pick }), el("span", { class: "leg-event", text: prop ? eventShort(l) : l.event, title: prop ? l.event : null }), prop || lst === "final" ? null : liveSlot(l.id)]),
          el("span", { class: "mono leg-price", text: fmtOdds(l.price) }),
          stateChip(lp)
        ]);
      })),
      el("div", { class: "pick-metrics potd-metrics" }, [
        el("div", { class: "pick-metric" }, [el("div", { class: "k", text: "Combined" }), el("div", { class: "v", text: fmtOdds(par.odds) })]),
        el("div", { class: "pick-metric", title: "The legs' probabilities from the game data, multiplied" }, [el("div", { class: "k", text: "To hit" }), el("div", { class: "v", text: pct(par.fairProb) })]),
        el("div", { class: "pick-metric" }, [el("div", { class: "k", text: "EV / unit" }), el("div", { class: "v edge", text: signed(par.ev * 100, 1) + "%" })])
      ]),
      el("p", { class: "pick-rationale", text: "Priced as one ticket at " + par.book + ". Legs are from different games and treated as independent, each at our probability from the game data; one loss loses the ticket, a push drops out." + (hasProp ? " A prop leg counts at its checked chance; if its player does not play, the ticket is void." : "") }),
      lockLine(par, opts),
      el("div", { class: "pick-foot" }, [
        el("span", { class: par.result ? "result result-" + par.result.toLowerCase() : "", text: status }),
        el("span", { class: "pick-actions" }, [
          leanIds.length ? el("button", { type: "button", class: "flip-btn", "data-breakdown": leanIds.join(","), text: leanIds.length === 1 ? "Leg breakdown" : "Leg breakdowns" }) : null,
          opts.loadButton && !begun && !hasProp ? el("button", { type: "button", class: "flip-btn", "data-load-parlay": "", text: "Load into the builder" }) : begun ? el("a", { class: "flip-btn", href: "picks.html#played", text: "In progress and results" }) : el("a", { class: "flip-btn", href: "picks.html#parlays", text: "See all the best parlays" })
        ])
      ])
    ]);
  }
  /* a parlay leg as its pick on the board (commence, sport, result), the leg's own result and started flag on top */
  function legAsPick(l) {
    /* a prop leg has no pick on the board: its start, sides and result ride on the leg itself */
    if (l && l.kind === "prop") return Object.assign({ id: l.id, kind: "prop", sport: l.sport, sportKey: l.sportKey, league: l.league, event: l.event, pick: l.pick, commence: l.commence, home: l.home, away: l.away }, l.result ? { result: l.result } : {}, l.void ? { status: "void" } : {}, l.started === true ? { started: true } : {});
    const p = findPick(l.id) || {};
    return Object.assign({}, p, { id: l.id, sport: p.sport || l.sport, event: p.event || l.event, pick: p.pick || l.pick }, !p.commence && l.commence ? { commence: l.commence } : {}, l.result ? { result: l.result } : {}, l.void ? { status: "void" } : {}, l.started === true ? { started: true } : {});
  }

  /* ---------- the day's play and parlay as a page shows them (home, digest; 2026-11-11) ----------
     Locked: what the pipeline published (PICKS_DATA.playOfDay, parlayOfDay). Before the lock: the front-runner, the first
     of the one ranked list (js/plays.js, on a page that loads it and data/props.js), marked not final. After the locking
     run with nothing named: a card that says so. An earlier day's play or parlay, once finished, leaves the card
     (`stale`: the home page's "last time" line reads it when the file has no `ofDay.last`).
     Returns { today, plays, check, front, ofDay, closed, lockAt (ms or null), play, parlay, stale: { play, parlay } } */
  function ofDayView() {
    const D = window.PICKS_DATA || {}, PL = window.EdgeLinePlays || null, PR = window.PROPS_DATA || null, t = now();
    const today = PL ? PL.dayOf(t) : etKey(new Date(t));
    const check = PL ? PL.checkOf(PR) : null, plays = PL ? PL.all(D, PR, t, { check: check }) : [];
    const front = plays.length ? PL.frontRunner(plays, t) : null;
    const od = D.ofDay && D.ofDay.date === today ? D.ofDay : null, at = od && od.lockAt ? Date.parse(od.lockAt) : NaN;
    const stale = { play: null, parlay: null };
    let play = D.playOfDay || null, parlay = D.parlayOfDay || null;
    const playDay = play ? ((D.ofDay && D.ofDay.date) || dayKey(play)) : null;
    if (play && playDay && playDay < today && gameState(play) === "final") { stale.play = { date: playDay, pick: play }; play = null; }
    const parDay = parlay ? (parlay.date || (D.ofDay && D.ofDay.date) || (/^parlay-(\d{4}-\d{2}-\d{2})$/.exec(parlay.id || "") || [])[1] || null) : null;
    if (parlay && parDay && parDay < today && (parlay.result || parlay.status === "graded" || parlay.status === "void")) { stale.parlay = { date: parDay, par: parlay }; parlay = null; }
    return { today: today, plays: plays, check: check, front: front, ofDay: od, closed: !!(od && od.closed), lockAt: Number.isFinite(at) ? at : front ? front.lockAt : PL ? PL.lockAt(today) : null, play: play, parlay: parlay, stale: stale };
  }
  function noneCard(cls, eyebrow, title, text) {
    return el("div", { class: "card " + cls + " potd-none" }, [el("span", { class: "eyebrow", text: eyebrow }), el("h3", { text: title }), el("p", { text: text })]);
  }
  function dayPlayCard(v) {
    return v.play ? potdCard(v.play)
      : v.closed ? noneCard("potd", word("ofDay"), "No " + word("ofDay").toLowerCase() + " today", "At the lock no game " + word("one") + " or player prop for today’s games had an edge at its price, so none was named. Nothing is forced.")
      : v.front && v.front.play ? potdCard(playAsPick(v.front.play, v.check), { front: true, lockAt: v.lockAt })
      : potdCard(null);
  }
  function dayParlayCard(v) {
    return v.parlay ? parlayCard(v.parlay)
      : v.closed ? noneCard("parlay", word("parlayOfDay"), "No parlay today", "It needs two " + word("many") + " or props from different games at one book, each with an edge at its price there. Today did not have them at the lock.")
      : v.front && v.front.parlay ? parlayCard(frontParlay(v.front.parlay), { front: true, lockAt: v.lockAt })
      : parlayCard(null);
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
          meta([p.event, p.market].concat(hasMoved(p) ? priceParts(p) : [fmtOdds(p.odds) + (p.book ? " at " + p.book : "")], [startLabel(p)]), "bd-sub"),
          valueLine(p, "bd-value"),
          moneylineLine(p, "bd-ml"),
          standingLine(p) ? el("p", { class: "bd-standing", text: standingLine(p) }) : null,
          flagLine(p, "bd-flag"),
          isOpen(p) ? null : el("p", { class: "bd-state" }, [stateChip(p), meta([gameState(p) === "final" && scoreText(p) ? "Final " + scoreText(p) : Number.isFinite(startMs(p)) ? "Started " + clockET(startMs(p)) : null, unitsText(p) || null], "bd-state-meta")]),
          modelLine(p),
          barLine(p, "bd-bar")
        ]),
        el("span", { class: "badge badge-conf-" + String(p.confidence).toLowerCase() + " bd-tier", text: tierLabel(p.confidence) })
      ])
    ]);
    /* the tier against this pick's own bar: the pipeline's text says it since 2026-11-05 (and the flat 3 / 5 / 8 for older
       picks); when the text predates that, the bar is said here from the pick's own numbers */
    const tierWhy = b && b.tierWhy ? String(b.tierWhy) : "", saysBar = /\bIts bar is\b|\bLean starts at\b/.test(tierWhy), own = barSentence(p);
    if (!b) { if (own) sec.appendChild(el("div", { class: "bd-block" }, [el("h4", { text: "Why " + tierLabel(p.confidence) }), el("p", { class: "bd-bar-why", text: own })])); sec.appendChild(el("p", { class: "muted", text: "No breakdown for this " + word("one") + " yet. It is written at the next data refresh." })); return sec; }
    const list = (title, items, cls) => items && items.length ? el("div", { class: "bd-block" }, [el("h4", { text: title }), el("ul", { class: "bd-list " + cls }, items.map(t => el("li", { text: t })))]) : null;
    sec.appendChild(el("div", { class: "bd-block" }, [el("h4", { text: "Why " + tierLabel(b.tier) }), !saysBar && own ? el("p", { class: "bd-bar-why", text: own }) : null, el("p", { text: tierText(tierWhy) })]));
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
    /* who the lean was posted knowing about, and whether that has changed since (the pipeline's availability flag) */
    if (postedKnowing(p)) { const av = p.availability, chk = Date.parse(av.checkedAt || ""); grid.appendChild(el("div", { class: "bd-cell bd-wide bd-avail" }, [el("h4", { text: "Who plays" }), el("p", { text: postedKnowing(p) }), el("p", { text: flagOf(p) ? flagNote(p) : "No change since" + (Number.isFinite(chk) ? ", checked " + clockET(chk) : "") + "." })])); }
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
    if (!picks.length) body.appendChild(el("p", { class: "muted", text: "That " + word("one") + " is no longer on the board." }));
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
      summary.textContent = active ? label + ": " + signed(Math.round(mUnits * 100) / 100, 2) + " units over " + active + " days, " + mW + "-" + mL + (mP ? "-" + mP : "") + "." : "No graded " + word("many") + " in " + label + ".";
    }
    head.addEventListener("click", function (e) { const b = e.target.closest("[data-cal]"); if (!b) return; month += Number(b.getAttribute("data-cal")); if (month < 0) { month = 11; year--; } if (month > 11) { month = 0; year++; } render(); });
    render();
    return { render: render, update: function (rows) { Object.keys(map).forEach(k => delete map[k]); (rows || []).forEach(d => { map[d.date] = d; }); render(); } };
  }

  window.EdgeLine = {
    impliedProb: impliedProb, fmtOdds: fmtOdds, pct: pct, edgeOf: edgeOf, signed: signed, isValidPick: isValidPick, decimalOdds: decimalOdds, americanFromDecimal: americanFromDecimal,
    hasModel: hasModel, probOf: probOf, edgeNum: edgeNum, rowEdge: rowEdge, probText: probText, edgeText: edgeText, barOf: barOf, watchOf: watchOf, barPts: barPts, watchPts: watchPts, gradeRule: GRADE_RULE,
    hasOwnBar: hasOwnBar, floorBar: floorBar, barRule: barRule, watchLineOf: watchLineOf, edgeFor: edgeFor, pastOf: pastOf, pastWord: pastWord, barGap: barGap, barName: barName, barLine: barLine, barSentence: barSentence, ptsLabel: ptsLabel,
    standingOf: standingOf, standingChip: standingChip, standingLine: standingLine, rowStatus: rowStatus, rowOnBoard: rowOnBoard, barsText: barsText,
    flagOf: flagOf, flagNote: flagNote, flagChip: flagChip, flagLine: flagLine, postedKnowing: postedKnowing, heldLine: heldLine, waitingOf: waitingOf, isHeld: isHeld, heldClears: heldClears, heldWhy: heldWhy, heldWhen: heldWhen, heldNote: heldNote, heldRun: heldRun, chipStatus: chipStatus, runAfter: runAfter, nextRunFor: nextRunFor,
    el: el, meta: meta, pickCard: pickCard, picksTable: picksTable, sortByEdge: sortByEdge, sortByProb: sortByProb, worthFirst: worthFirst, worthTier: worthTier, dayKey: dayKey, dayLabel: dayLabel, dayCmp: dayCmp, dayDivider: dayDivider, etKey: etKey, keyDate: keyDate, shortDate: shortDate, rankChip: rankChip, eventShort: eventShort, initTilt: initTilt, animateNumber: animateNumber,
    potdCard: potdCard, parlayCard: parlayCard, isPropPlay: isPropPlay, propHref: propHref, propSel: propSel, playAsPick: playAsPick, frontParlay: frontParlay, lockLine: lockLine, probMeter: probMeter, ofDayView: ofDayView, dayPlayCard: dayPlayCard, dayParlayCard: dayParlayCard, parlayMath: parlayMath, bestParlays: bestParlays, slip: slip, parlayButton: parlayButton, pnlCalendar: pnlCalendar, openBreakdown: openBreakdown,
    lineShop: lineShop, shopSummary: shopSummary, shopChips: shopChips, shopTable: shopTable, bookAbbr: bookAbbr, liveSlot: liveSlot,
    marketData: marketData, marketRows: marketRows, watchlist: watchlist, marketSummary: marketSummary, marketTable: marketTable, pulseCard: pulseCard, statusLabel: statusLabel,
    now: now, startMs: startMs, gameState: gameState, isOpen: isOpen, openOnly: openOnly, gameHours: gameHours, resultWord: resultWord, stateKey: stateKey, stateText: stateText, stateChip: stateChip, clockET: clockET, aboutET: aboutET, startLabel: startLabel, ago: ago, scoreText: scoreText, unitsText: unitsText,
    onStateChange: onStateChange, checkStates: checkStates, updateLine: updateLine, updateParts: updateParts, nextRun: nextRun,
    playedPicks: playedPicks, playedRow: playedRow, playedSummary: playedSummary, startedNote: startedNote, findPick: findPick, legAsPick: legAsPick,
    tierLabel: tierLabel, tierText: tierText, hasMoved: hasMoved, priceParts: priceParts, valueLine: valueLine, clearPrice: clearPrice, clearFor: clearFor, clearText: clearText, clearLine: clearLine, moneylineFor: moneylineFor, moneylineLine: moneylineLine, runClock: runClock,
    call: callName, word: word, nWord: nWord, applyCall: applyCall, replayData: replayData, replayText: replayText, replayFigures: replayFigures, roiText: roiText
  };
})();
