/* ==========================================================================
   EdgeLine AI — the edge field
   Every side of every main-line market the pipeline priced, plotted as a
   star: price across (long shots left, favourites right), edge up. Three
   horizons: fair (0), watch (+0.5) and the bar (+1.0). Anything above the
   bar is a pick. Dependency-free SVG; colours come from the CSS tokens.
   Exposes window.EdgeLineField.render(host, opts)
   ========================================================================== */
(function () {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  function s(tag, attrs) {
    const n = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }
  function text(x, y, str, cls, anchor) {
    const t = s("text", { x: x, y: y, class: cls, "text-anchor": anchor || "start" });
    t.textContent = str;
    return t;
  }
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* the rows to plot: every side, with pick status decided by the current board */
  function rows() {
    const E = window.EdgeLine, m = E.marketData();
    const onBoard = {};
    ((window.PICKS_DATA || {}).picks || []).forEach(function (p) { onBoard[p.id] = true; });
    return (m.rows || []).map(function (r) {
      const isPick = !!(r.pickId && onBoard[r.pickId]);
      const status = isPick ? "pick" : r.edge >= (m.watch || 0.005) ? "watch" : "none";
      return { r: r, x: E.impliedProb(r.odds), y: r.edge * 100, status: status, pickId: isPick ? r.pickId : null };
    }).filter(function (d) { return Number.isFinite(d.x) && Number.isFinite(d.y); });
  }

  function render(host, opts) {
    opts = opts || {};
    const E = window.EdgeLine, m = E.marketData();
    const data = rows();
    host.replaceChildren();
    if (!data.length) { host.hidden = true; return null; }
    host.hidden = false;
    const bar = (m.threshold || 0.01) * 100, watch = (m.watch || 0.005) * 100;
    const narrow = host.clientWidth > 0 && host.clientWidth < 560;
    const W = narrow ? 520 : 960, H = narrow ? 340 : 380;
    const padL = narrow ? 40 : 56, padR = narrow ? 14 : 24, padT = 26, padB = narrow ? 40 : 44;
    const ys = data.map(function (d) { return d.y; });
    const yMin = Math.floor(Math.min.apply(null, ys) - 0.4), yMax = Math.ceil(Math.max(bar + 0.8, Math.max.apply(null, ys) + 0.5));
    const sx = function (p) { return padL + ((Math.min(0.92, Math.max(0.08, p)) - 0.08) / 0.84) * (W - padL - padR); };
    const sy = function (v) { return padT + (1 - (v - yMin) / (yMax - yMin)) * (H - padT - padB); };

    const picks = data.filter(function (d) { return d.status === "pick"; }).length;
    const watching = data.filter(function (d) { return d.status === "watch"; }).length;
    const sorted = data.slice().sort(function (a, b) { return b.y - a.y; });
    const best = sorted[0];
    const label = picks ? picks + (picks === 1 ? " side clears the bar" : " sides clear the bar") : "none clears the bar";
    const svg = s("svg", { viewBox: "0 0 " + W + " " + H, role: "img", class: "field-svg" + (narrow ? " narrow" : ""),
      "aria-label": data.length + " sides priced across " + (m.games || 0) + " games, " + label + ". " + watching + " within half a point. Listed in full on the market board." });

    /* the pick zone and its horizons */
    svg.appendChild(s("rect", { x: padL, y: padT - 6, width: W - padL - padR, height: Math.max(0, sy(bar) - padT + 6), class: "field-zone" }));
    for (let v = yMin; v <= yMax; v += 1) {
      if (v === 0 || Math.abs(v - bar) < 0.001) continue;
      svg.appendChild(s("line", { x1: padL, x2: W - padR, y1: sy(v), y2: sy(v), class: "gridline" }));
      svg.appendChild(text(padL - 8, sy(v) + 4, E.signed(v, 0), "tick", "end"));
    }
    svg.appendChild(s("line", { x1: padL, x2: W - padR, y1: sy(0), y2: sy(0), class: "field-fair" }));
    svg.appendChild(text(padL - 8, sy(0) + 4, "0", "tick", "end"));
    svg.appendChild(text(W - padR, sy(0) - 6, "FAIR PRICE", "field-horizon-label", "end"));
    svg.appendChild(s("line", { x1: padL, x2: W - padR, y1: sy(watch), y2: sy(watch), class: "field-watch" }));
    svg.appendChild(text(W - padR, sy(watch) - 6, "WATCH " + E.signed(watch, 1), "field-horizon-label field-horizon-watch", "end"));
    svg.appendChild(s("line", { x1: padL, x2: W - padR, y1: sy(bar), y2: sy(bar), class: "field-bar" }));
    svg.appendChild(text(padL - 8, sy(bar) + 4, E.signed(bar, 0), "tick field-bar-tick", "end"));
    svg.appendChild(text(W - padR, sy(bar) - 7, "THE BAR " + E.signed(bar, 1) + " PT · PICKS LIVE HERE", "field-horizon-label field-horizon-bar", "end"));

    /* price axis: American odds at even steps of implied probability */
    [0.2, 0.35, 0.5, 0.65, 0.8].forEach(function (p) {
      const odds = p === 0.5 ? "EVEN" : E.fmtOdds(E.americanFromDecimal(1 / p));
      svg.appendChild(s("line", { x1: sx(p), x2: sx(p), y1: H - padB, y2: H - padB + 5, class: "axis" }));
      svg.appendChild(text(sx(p), H - padB + 18, odds, "tick", "middle"));
    });
    svg.appendChild(s("line", { x1: padL, x2: W - padR, y1: H - padB, y2: H - padB, class: "axis" }));
    svg.appendChild(text(padL, H - 6, "LONG SHOTS", "field-axis-label", "start"));
    svg.appendChild(text(W - padR, H - 6, "FAVOURITES", "field-axis-label", "end"));
    svg.appendChild(text(padL - 8, padT - 10, "EDGE, PTS", "field-axis-label", "end"));

    /* the stars: drawn dimmest first so the hot ones sit on top */
    const tt = tooltip(host);
    const order = data.slice().sort(function (a, b) { return a.y - b.y; });
    const focusable = {};
    sorted.slice(0, 8).forEach(function (d) { focusable[d.r.eventId + "|" + d.r.marketKey + "|" + d.r.pick] = true; });
    order.forEach(function (d, i) {
      const hot = d.status !== "none";
      const g = s("g", { class: "star star-" + d.status + (hot ? " hot" : ""), "data-sport": d.r.sport, style: "--i:" + i });
      if (hot) g.appendChild(s("circle", { cx: sx(d.x), cy: sy(d.y), r: d.status === "pick" ? 14 : 10, class: "star-ring" }));
      g.appendChild(s("circle", { cx: sx(d.x), cy: sy(d.y), r: d.status === "pick" ? 6.5 : d.status === "watch" ? 5 : 3.2, class: "dot" }));
      const key = d.r.eventId + "|" + d.r.marketKey + "|" + d.r.pick;
      const desc = d.r.pick + " " + E.fmtOdds(d.r.odds) + " at " + d.r.book + ", " + d.r.event + ", edge " + E.signed(d.y, 1) + " points";
      if (focusable[key] || hot) { g.setAttribute("tabindex", "0"); g.setAttribute("role", "link"); g.setAttribute("aria-label", desc); }
      else g.setAttribute("aria-hidden", "true");
      const show = function () {
        const rect = svg.getBoundingClientRect(), hostRect = host.getBoundingClientRect();
        const px = rect.left - hostRect.left + (sx(d.x) / W) * rect.width, py = rect.top - hostRect.top + (sy(d.y) / H) * rect.height;
        tt.date.textContent = d.r.event + " · " + (d.r.start || "");
        tt.val.textContent = d.r.pick + "  " + E.fmtOdds(d.r.odds);
        tt.name.textContent = d.r.book + " · fair " + E.pct(d.r.modelProb) + " vs " + E.pct(d.x) + " · " + E.signed(d.y, 1) + " pts · " + E.statusLabel(d.status);
        tt.key.setAttribute("data-sport", d.r.sport);
        tt.el.style.left = px + "px"; tt.el.style.top = py + "px"; tt.el.hidden = false;
        g.classList.add("lit");
      };
      const hide = function () { tt.el.hidden = true; g.classList.remove("lit"); };
      g.addEventListener("pointerenter", show); g.addEventListener("pointerleave", hide);
      g.addEventListener("focus", show); g.addEventListener("blur", hide);
      const go = function () { location.href = d.pickId ? (opts.pickHref || "picks.html#") + d.pickId : (opts.boardHref || "picks.html#market"); };
      g.addEventListener("click", go);
      g.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
      svg.appendChild(g);
    });

    const wrap = E.el("div", { class: "field-body" });
    wrap.appendChild(svg);
    host.appendChild(wrap);
    host.appendChild(tt.el);

    /* legend: one chip per sport, each a filter */
    const counts = {};
    data.forEach(function (d) { counts[d.r.sport] = (counts[d.r.sport] || 0) + 1; });
    const legend = E.el("div", { class: "field-legend", role: "group", "aria-label": "Filter the field by sport" });
    let active = null;
    Object.keys(counts).sort().forEach(function (sport) {
      const chip = E.el("button", { type: "button", class: "badge badge-sport field-chip", "data-sport": sport, "aria-pressed": "false" }, [sport + " ", E.el("span", { class: "field-chip-n", text: String(counts[sport]) })]);
      chip.addEventListener("click", function () {
        active = active === sport ? null : sport;
        legend.querySelectorAll(".field-chip").forEach(function (c) { c.setAttribute("aria-pressed", String(c.getAttribute("data-sport") === active)); });
        if (active) svg.setAttribute("data-only", active); else svg.removeAttribute("data-only");
      });
      legend.appendChild(chip);
    });
    const note = E.el("p", { class: "field-note" });
    if (best) {
      const gap = bar - best.y;
      note.appendChild(E.el("span", { text: (picks ? "Top of the field: " : "Closest to the bar: ") }));
      note.appendChild(E.el("strong", { text: best.r.pick + " " + E.fmtOdds(best.r.odds) }));
      note.appendChild(E.el("span", { text: " at " + best.r.book + ", " + E.signed(best.y, 1) + " pts" + (picks ? "." : gap > 0 ? ", " + gap.toFixed(1) + " short." : ".") }));
    }
    const foot = E.el("div", { class: "field-foot" }, [legend, note]);
    host.appendChild(foot);

    /* draw-in once the field scrolls into view */
    if (!reduceMotion && "IntersectionObserver" in window) {
      const io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { svg.classList.add("animate"); io.disconnect(); } });
      }, { threshold: 0.2 });
      io.observe(host);
    }
    return { sides: data.length, games: m.games || 0, picks: picks, watch: watching, best: best ? best.r : null, bar: bar };
  }

  function tooltip(host) {
    const E = window.EdgeLine;
    const key = E.el("span", { class: "tt-key" }), val = E.el("span", { class: "tt-val" }), name = E.el("span", { class: "tt-name" }), date = E.el("div", { class: "tt-date" });
    const el = E.el("div", { class: "tooltip field-tip", hidden: "" }, [date, E.el("div", { class: "tt-row" }, [key, val]), E.el("div", { class: "tt-sub" }, [name])]);
    el.hidden = true;
    return { el: el, key: key, val: val, name: name, date: date };
  }

  /* re-render when the host crosses the narrow breakpoint (phone vs desktop viewBox) */
  function mount(host, opts) {
    let wasNarrow = null, timer = null;
    const draw = function () {
      const narrow = host.clientWidth > 0 && host.clientWidth < 560;
      if (narrow === wasNarrow) return;
      wasNarrow = narrow;
      const out = render(host, opts);
      if (opts && typeof opts.onRender === "function") opts.onRender(out);
    };
    draw();
    window.addEventListener("resize", function () { clearTimeout(timer); timer = setTimeout(draw, 150); });
  }

  window.EdgeLineField = { render: render, mount: mount, rows: rows };
})();
