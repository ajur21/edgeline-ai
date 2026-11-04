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
          el("span", { class: "badge badge-sample", text: "Sample" }),
          el("span", { class: confClass, text: p.confidence })
        ])
      ]),
      el("div", {}, [
        el("div", { class: "pick-event", text: p.event }),
        el("h3", { class: "pick-selection", text: p.pick }),
        el("div", { class: "pick-market" }, [p.market + " · ", el("span", { class: "mono", text: fmtOdds(p.odds) })])
      ]),
      el("div", { class: "meter", "aria-hidden": "true" }, [
        el("span", { style: "width:" + meterWidth + "%" })
      ]),
      el("div", { class: "pick-metrics" }, [
        el("div", { class: "pick-metric" }, [el("div", { class: "k", text: "Model" }), el("div", { class: "v", text: pct(p.modelProb) })]),
        el("div", { class: "pick-metric" }, [el("div", { class: "k", text: "Implied" }), el("div", { class: "v", text: pct(impliedProb(p.odds)) })]),
        el("div", { class: "pick-metric" }, [el("div", { class: "k", text: "Edge" }), el("div", { class: "v edge", text: signed(edge * 100, 1) + "%" })])
      ]),
      el("div", { class: "pick-foot" }, [
        el("span", { text: p.league + " · " + p.start }),
        flipBtn
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
      el("td", {}, [el("span", { class: "badge badge-conf-" + String(p.confidence).toLowerCase(), text: p.confidence })])
    ]);
  }

  function picksTable(picks) {
    const head = el("tr", {}, ["Sport", "Event", "Start", "Market", "Pick", "Odds", "Model", "Implied", "Edge", "Confidence"]
      .map(function (h, i) { return el("th", { scope: "col", class: i >= 5 && i <= 8 ? "num" : "" , text: h }); }));
    const tbody = el("tbody", {}, picks.map(pickRow));
    return el("div", { class: "table-wrap", tabindex: "0", role: "region", "aria-label": "Picks table" }, [el("table", { class: "data" }, [el("thead", {}, [head]), tbody])]);
  }

  function sortByEdge(picks) {
    return (picks || []).filter(isValidPick).sort(function (a, b) { return edgeOf(b) - edgeOf(a); });
  }

  window.EdgeLine = {
    impliedProb: impliedProb, fmtOdds: fmtOdds, pct: pct, edgeOf: edgeOf, signed: signed, isValidPick: isValidPick,
    el: el, pickCard: pickCard, picksTable: picksTable, sortByEdge: sortByEdge, initTilt: initTilt, animateNumber: animateNumber
  };
})();
