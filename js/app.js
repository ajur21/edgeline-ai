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
      const d = elm.getAttribute("data-sample-flag") === "perf" ? window.PERF_DATA : window.PICKS_DATA;
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
  function edgeOf(pick) { return Number(pick.modelProb) - impliedProb(pick.odds); }
  /* a pick is usable only if its odds and model probability are real numbers */
  function isValidPick(p) {
    const o = Number(p && p.odds), m = Number(p && p.modelProb);
    return Number.isFinite(o) && o !== 0 && Number.isFinite(m) && m >= 0 && m <= 1;
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
      if (k === "class") node.className = attrs[k];
      else if (k === "text") node.textContent = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) node.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return node;
  }

  /* ---------- pick card ---------- */
  /* sample data files set sample:true; real data from scripts/update-data.js sets it false */
  function isSample() { const d = window.PICKS_DATA; return !d || d.sample !== false; }

  /* a pick card is two faces: numbers on the front, the "why" on the back; it flips in 3D */
  function pickCard(p) {
    const edge = edgeOf(p);
    const confClass = "badge badge-conf-" + String(p.confidence).toLowerCase();
    const meterWidth = Math.max(4, Math.min(100, edge * 100 * 8)); // 12.5% edge fills the bar
    const factors = Array.isArray(p.factors) ? p.factors : [];
    const flipBtn = el("button", { type: "button", class: "flip-btn", "aria-expanded": "false", text: "Why this pick" });
    const backBtn = el("button", { type: "button", class: "flip-btn", text: "Back to numbers" });
    const front = el("div", { class: "pick-face pick-front" }, [
      el("div", { class: "pick-head" }, [
        el("span", { class: "badge badge-sport", "data-sport": p.sport, text: p.sport }),
        el("span", { class: "pick-head-right" }, [
          isSample() ? el("span", { class: "badge badge-sample", text: "Sample" }) : null,
          isPlayOfDay(p.id) ? el("span", { class: "badge badge-potd", text: "Play of the day" }) : null,
          el("span", { class: confClass, text: p.confidence })
        ])
      ]),
      el("div", {}, [
        el("div", { class: "pick-event", text: p.event }),
        el("h3", { class: "pick-selection", text: p.pick }),
        el("div", { class: "pick-market" }, [p.market + " · ", el("span", { class: "mono", text: fmtOdds(p.odds) }), p.book ? " · " + p.book : ""])
      ]),
      el("div", { class: "meter", "aria-hidden": "true" }, [
        el("span", { style: "width:" + meterWidth + "%" })
      ]),
      el("div", { class: "pick-metrics" }, [
        el("div", { class: "pick-metric" }, [el("div", { class: "k", text: "Fair" }), el("div", { class: "v", text: pct(p.modelProb) })]),
        el("div", { class: "pick-metric" }, [el("div", { class: "k", text: "Implied" }), el("div", { class: "v", text: pct(impliedProb(p.odds)) })]),
        el("div", { class: "pick-metric" }, [el("div", { class: "k", text: "Edge" }), el("div", { class: "v edge", text: signed(edge * 100, 1) + "%" })])
      ]),
      el("div", { class: "pick-foot" }, [
        el("span", { text: p.league + " · " + p.start }),
        el("span", { class: "pick-actions" }, [parlayButton(p.id), flipBtn])
      ])
    ]);
    const back = el("div", { class: "pick-face pick-back", "aria-hidden": "true" }, [
      el("div", { class: "pick-head" }, [
        el("span", { class: "eyebrow", text: "Why the model likes it" }),
        el("span", { class: confClass, text: p.confidence })
      ]),
      el("h3", { class: "pick-selection", text: p.pick }),
      el("p", { class: "pick-rationale", text: p.rationale }),
      factors.length ? el("ul", { class: "pick-factors" }, factors.map(function (f) { return el("li", { text: f }); })) : null,
      el("div", { class: "pick-foot" }, [
        el("span", { class: "mono", text: "Edge " + signed(edge * 100, 1) + "%" }),
        backBtn
      ])
    ]);
    const card = el("article", { class: "card pick", "data-id": p.id, "data-sport": p.sport, "data-tilt": "" }, [
      el("div", { class: "pick-inner" }, [front, back])
    ]);
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

  function pickRow(p) {
    const edge = edgeOf(p);
    return el("tr", {}, [
      el("td", { text: p.sport }),
      el("td", { text: p.event }),
      el("td", { text: p.start }),
      el("td", { text: p.market }),
      el("td", {}, [el("strong", { text: p.pick })]),
      el("td", { class: "num", text: fmtOdds(p.odds) }),
      el("td", { class: "num", text: pct(p.modelProb) }),
      el("td", { class: "num", text: pct(impliedProb(p.odds)) }),
      el("td", { class: "num", text: signed(edge * 100, 1) + "%" }),
      el("td", {}, [el("span", { class: "badge badge-conf-" + String(p.confidence).toLowerCase(), text: p.confidence })]),
      el("td", {}, [parlayButton(p.id)])
    ]);
  }

  function picksTable(picks) {
    const head = el("tr", {}, ["Sport", "Event", "Start", "Market", "Pick", "Odds", "Fair", "Implied", "Edge", "Confidence", "Parlay"]
      .map(function (h, i) { return el("th", { scope: "col", class: i >= 5 && i <= 8 ? "num" : "" , text: h }); }));
    const tbody = el("tbody", {}, picks.map(pickRow));
    return el("div", { class: "table-wrap", tabindex: "0", role: "region", "aria-label": "Picks table" }, [el("table", { class: "data" }, [el("thead", {}, [head]), tbody])]);
  }

  function sortByEdge(picks) {
    return (picks || []).filter(isValidPick).sort(function (a, b) { return edgeOf(b) - edgeOf(a); });
  }

  /* ---------- play of the day ---------- */
  function isPlayOfDay(id) { const d = window.PICKS_DATA; return !!(d && d.playOfDay && d.playOfDay.id === id); }
  function potdCard(p) {
    if (!p) return el("div", { class: "card empty", text: "No play of the day yet. It is chosen at the first refresh with picks, around noon ET." });
    const edge = edgeOf(p);
    const status = p.result ? "Result: " + p.result : p.started ? "Started" : p.start;
    return el("article", { class: "card potd", "data-sport": p.sport, "data-tilt": "" }, [
      el("div", { class: "pick-head" }, [
        el("span", { class: "eyebrow", text: "Play of the day" }),
        el("span", { class: "badge badge-sport", "data-sport": p.sport, text: p.sport })
      ]),
      el("div", { class: "potd-event", text: p.event }),
      el("h3", { class: "potd-selection", text: p.pick }),
      el("div", { class: "potd-line" }, [p.market + " · ", el("span", { class: "mono", text: fmtOdds(p.odds) }), p.book ? " · " + p.book : ""]),
      el("div", { class: "pick-metrics potd-metrics" }, [
        el("div", { class: "pick-metric" }, [el("div", { class: "k", text: "Fair" }), el("div", { class: "v", text: pct(p.modelProb) })]),
        el("div", { class: "pick-metric" }, [el("div", { class: "k", text: "Edge" }), el("div", { class: "v edge", text: signed(edge * 100, 1) + "%" })]),
        el("div", { class: "pick-metric" }, [el("div", { class: "k", text: "EV / unit" }), el("div", { class: "v edge", text: signed((p.ev == null ? p.modelProb * decimalOdds(p.odds) - 1 : p.ev) * 100, 1) + "%" })])
      ]),
      el("p", { class: "pick-rationale", text: p.rationale }),
      el("div", { class: "pick-foot" }, [
        el("span", { class: p.result ? "result result-" + p.result.toLowerCase() : "", text: status }),
        el("span", { class: "pick-actions" }, [p.started ? null : parlayButton(p.id), el("a", { class: "flip-btn", href: "picks.html#" + p.id, text: "See on the board" })])
      ])
    ]);
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
    if (!par) return el("div", { class: "card empty", text: "No parlay of the day yet. It needs two or more picks from different games that are all worth a bet at the same book." });
    const status = par.result ? "Result: " + par.result : par.legs.some(l => l.started) ? "In progress" : "All legs ahead";
    return el("article", { class: "card parlay", "data-tilt": "" }, [
      el("div", { class: "pick-head" }, [
        el("span", { class: "eyebrow", text: "Parlay of the day" }),
        el("span", { class: "badge badge-strong", text: par.legs.length + " legs" })
      ]),
      el("ul", { class: "parlay-legs" }, par.legs.map(function (l) {
        return el("li", {}, [
          el("span", { class: "badge badge-sport", "data-sport": l.sport, text: l.sport }),
          el("span", { class: "leg-pick" }, [el("strong", { text: l.pick }), el("span", { class: "leg-event", text: l.event })]),
          el("span", { class: "mono leg-price", text: fmtOdds(l.price) }),
          l.result ? el("span", { class: "result result-" + l.result.toLowerCase(), text: l.result }) : null
        ]);
      })),
      el("div", { class: "pick-metrics potd-metrics" }, [
        el("div", { class: "pick-metric" }, [el("div", { class: "k", text: "Combined" }), el("div", { class: "v", text: fmtOdds(par.odds) })]),
        el("div", { class: "pick-metric" }, [el("div", { class: "k", text: "Fair" }), el("div", { class: "v", text: pct(par.fairProb) })]),
        el("div", { class: "pick-metric" }, [el("div", { class: "k", text: "EV / unit" }), el("div", { class: "v edge", text: signed(par.ev * 100, 1) + "%" })])
      ]),
      el("p", { class: "pick-rationale", text: "Priced as one ticket at " + par.book + ". Legs are from different games and treated as independent; one loss loses the ticket, a push drops out." }),
      el("div", { class: "pick-foot" }, [
        el("span", { class: par.result ? "result result-" + par.result.toLowerCase() : "", text: status }),
        opts.loadButton ? el("button", { type: "button", class: "flip-btn", "data-load-parlay": "", text: "Load into the builder" }) : el("a", { class: "flip-btn", href: "picks.html#parlay", text: "Open the builder" })
      ])
    ]);
  }

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
    el: el, pickCard: pickCard, picksTable: picksTable, sortByEdge: sortByEdge, initTilt: initTilt, animateNumber: animateNumber,
    potdCard: potdCard, parlayCard: parlayCard, parlayMath: parlayMath, slip: slip, parlayButton: parlayButton, pnlCalendar: pnlCalendar
  };
})();
