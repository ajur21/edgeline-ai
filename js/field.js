/* ==========================================================================
   EdgeLine AI — the edge field
   Every side of every main-line market the pipeline priced, plotted as a
   star: price across (long shots left, favourites right), and up, how far
   our edge over the price (our probability from the game data minus what
   the price implies) sits past that side's own bar. Since 2026-11-05 each
   side has its own bar, the model's own margin of error on it (never under
   3 points), so the line at 0 is the bar for every sport: a pick sits on or
   above it, and every sport is read on one scale. When every plotted side
   shares one bar (a file written before then, or one sport filling in), the
   even-with-the-price and watch horizons are drawn as well. Status colours
   come from each side's own bar. A side with no model yet has no edge and is
   counted, not plotted. Dependency-free SVG; colours come from the tokens.
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

  /* the rows to plot: every side of a game that has not started, with pick status decided by the current board */
  function rows() {
    const E = window.EdgeLine, m = E.marketData();
    const onBoard = {};
    ((window.PICKS_DATA || {}).picks || []).forEach(function (p) { onBoard[p.id] = true; });
    return (m.rows || []).filter(E.isOpen).map(function (r) {
      const isPick = !!(r.pickId && onBoard[r.pickId]), modelled = E.hasModel(r) && r.edge != null && Number.isFinite(Number(r.edge));
      /* status from the row's own bar: watch from halfway to it, a pick only while it is on the board */
      const status = isPick ? "pick" : modelled ? E.rowStatus(r) : "none";
      const edge = modelled ? Number(r.edge) * 100 : NaN, bar = E.barOf(r) * 100;
      return { r: r, x: E.impliedProb(r.odds), edge: edge, bar: bar, watch: E.watchLineOf(r) * 100, y: edge - bar, status: status, pickId: isPick ? r.pickId : null };
    }).filter(function (d) { return Number.isFinite(d.x) && Number.isFinite(d.y); });
  }
  /* sides priced but not yet modelled: they have a price and no edge, so they are counted beside the field, never plotted */
  function unmodelled() { const E = window.EdgeLine; return (E.marketData().rows || []).filter(function (r) { return E.isOpen(r) && !E.hasModel(r); }).length; }

  function render(host, opts) {
    opts = opts || {};
    const E = window.EdgeLine, m = E.marketData(), sum = E.marketSummary();
    const data = rows(), noModel = unmodelled();
    host.replaceChildren();
    if (!data.length) { host.hidden = true; return null; }
    host.hidden = false;
    /* one bar for every plotted side (old files, or a sport that has filled in): the price and watch horizons are single lines too */
    const barSet = {}; data.forEach(function (d) { barSet[d.bar.toFixed(1)] = true; });
    const uniform = Object.keys(barSet).length === 1, oneBar = data[0].bar;
    const evenY = uniform ? -oneBar : null, watchY = uniform ? data[0].watch - oneBar : null;
    const narrow = host.clientWidth > 0 && host.clientWidth < 560;
    const W = narrow ? 520 : 960, H = narrow ? 340 : 380;
    const padL = narrow ? 40 : 56, padR = narrow ? 14 : 24, padT = 26, padB = narrow ? 40 : 44;
    const ys = data.map(function (d) { return d.y; });
    const yMin = Math.floor(Math.min.apply(null, ys.concat(uniform ? [evenY] : [])) - 0.4), yMax = Math.ceil(Math.max(0.8, Math.max.apply(null, ys) + 0.5));
    const step = yMax - yMin > 24 ? 5 : yMax - yMin > 12 ? 2 : 1;
    const sx = function (p) { return padL + ((Math.min(0.92, Math.max(0.08, p)) - 0.08) / 0.84) * (W - padL - padR); };
    const sy = function (v) { return padT + (1 - (v - yMin) / (yMax - yMin)) * (H - padT - padB); };

    const picks = data.filter(function (d) { return d.status === "pick"; }).length;
    const watching = data.filter(function (d) { return d.status === "watch"; }).length;
    const sorted = data.slice().sort(function (a, b) { return b.y - a.y; });
    const best = sorted[0];
    const label = picks ? E.nWord(picks) + " on the board" : "none is on the board";
    const svg = s("svg", { viewBox: "0 0 " + W + " " + H, role: "img", class: "field-svg" + (narrow ? " narrow" : ""),
      "aria-label": data.length + " sides priced across " + (sum.games || 0) + " games, given our probability from the game data and plotted by how far each edge sits past its own bar; " + label + ". " + watching + " on watch, at least halfway to their bar." + (noModel ? " " + noModel + " more with no model yet." : "") + " Listed in full on the market board." });

    /* the pick zone and its horizons: the bar at 0 for every side */
    svg.appendChild(s("rect", { x: padL, y: padT - 6, width: W - padL - padR, height: Math.max(0, sy(0) - padT + 6), class: "field-zone" }));
    /* a tick label is dropped when it would sit on a horizon's own label (pixels, so it holds at any range) */
    const near = function (v, h) { return h != null && Math.abs(sy(v) - sy(h)) < 12; };
    const skip = function (v) { return Math.abs(v) < 0.001 || near(v, 0) || (uniform && (near(v, evenY) || near(v, watchY))); };
    let watchLabelled = true;
    for (let v = Math.ceil(yMin / step) * step; v <= yMax; v += step) {
      if (skip(v)) continue;
      svg.appendChild(s("line", { x1: padL, x2: W - padR, y1: sy(v), y2: sy(v), class: "gridline" }));
      svg.appendChild(text(padL - 8, sy(v) + 4, E.signed(v, 0), "tick", "end"));
    }
    if (uniform) {
      /* the bar's label sits above its line; even-with-the-price below its own; watch, between the two, on the left when there is room */
      svg.appendChild(s("line", { x1: padL, x2: W - padR, y1: sy(evenY), y2: sy(evenY), class: "field-fair" }));
      svg.appendChild(text(padL - 8, sy(evenY) + 4, E.signed(evenY, evenY % 1 ? 1 : 0), "tick", "end"));
      const below = H - padB - sy(evenY) > 18;
      svg.appendChild(text(W - padR, below ? sy(evenY) + 14 : sy(evenY) - 6, "EVEN WITH THE PRICE", "field-horizon-label", "end"));
      svg.appendChild(s("line", { x1: padL, x2: W - padR, y1: sy(watchY), y2: sy(watchY), class: "field-watch" }));
      watchLabelled = sy(watchY) - sy(0) >= 13;
      if (watchLabelled) svg.appendChild(text(padL + 8, sy(watchY) - 4, narrow ? "WATCH" : "WATCH, HALFWAY TO THE BAR", "field-horizon-label field-horizon-watch", "start"));
    }
    svg.appendChild(s("line", { x1: padL, x2: W - padR, y1: sy(0), y2: sy(0), class: "field-bar" }));
    svg.appendChild(text(padL - 8, sy(0) + 4, "0", "tick field-bar-tick", "end"));
    svg.appendChild(text(W - padR, sy(0) - 7, uniform ? (narrow ? "THE BAR, " + E.ptsLabel(oneBar / 100) + " PTS" : "THE BAR, " + E.ptsLabel(oneBar / 100) + " PTS OF EDGE · PICKS LIVE HERE") : narrow ? "EACH SIDE’S OWN BAR" : "EACH SIDE’S OWN BAR · PICKS LIVE HERE", "field-horizon-label field-horizon-bar", "end"));

    /* price axis: American odds at even steps of implied probability */
    [0.2, 0.35, 0.5, 0.65, 0.8].forEach(function (p) {
      const odds = p === 0.5 ? "EVEN" : E.fmtOdds(E.americanFromDecimal(1 / p));
      svg.appendChild(s("line", { x1: sx(p), x2: sx(p), y1: H - padB, y2: H - padB + 5, class: "axis" }));
      svg.appendChild(text(sx(p), H - padB + 18, odds, "tick", "middle"));
    });
    svg.appendChild(s("line", { x1: padL, x2: W - padR, y1: H - padB, y2: H - padB, class: "axis" }));
    svg.appendChild(text(padL, H - 6, "LONG SHOTS", "field-axis-label", "start"));
    svg.appendChild(text(W - padR, H - 6, "FAVOURITES", "field-axis-label", "end"));
    svg.appendChild(text(padL, padT - 10, "UP: PAST ITS OWN BAR, PTS", "field-axis-label", "start"));

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
      const pastTxt = d.y >= 0 ? d.y.toFixed(1) + " past" : (-d.y).toFixed(1) + " short";
      const desc = d.r.pick + " " + E.fmtOdds(d.r.odds) + " at " + d.r.book + ", " + d.r.event + ", edge " + E.signed(d.edge, 1) + " points, " + pastTxt + " of its bar of " + E.ptsLabel(d.bar / 100);
      if (focusable[key] || hot) { g.setAttribute("tabindex", "0"); g.setAttribute("role", "link"); g.setAttribute("aria-label", desc); }
      else g.setAttribute("aria-hidden", "true");
      const show = function () {
        const rect = svg.getBoundingClientRect(), hostRect = host.getBoundingClientRect();
        const px = rect.left - hostRect.left + (sx(d.x) / W) * rect.width, py = rect.top - hostRect.top + (sy(d.y) / H) * rect.height;
        tt.date.textContent = d.r.event + " · " + E.startLabel(d.r);
        tt.val.textContent = d.r.pick + "  " + E.fmtOdds(d.r.odds);
        tt.name.textContent = d.r.book + " · to hit " + E.pct(d.r.modelProb) + " (ours) vs " + E.pct(d.x) + " implied · edge " + E.signed(d.edge, 1) + " · bar " + E.ptsLabel(d.bar / 100) + ", " + pastTxt + " · " + E.statusLabel(d.status);
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
      note.appendChild(E.el("span", { text: (picks ? "Top of the field: " : "Closest to its bar: ") }));
      note.appendChild(E.el("strong", { text: best.r.pick + " " + E.fmtOdds(best.r.odds) }));
      note.appendChild(E.el("span", { text: " at " + best.r.book + ", " + E.signed(best.edge, 1) + " pts over the price, " + (best.y >= 0 ? best.y.toFixed(1) + " past" : (-best.y).toFixed(1) + " short of") + " its bar of " + E.ptsLabel(best.bar / 100) + "." }));
    }
    /* the bars differ by sport and game: say the range once, under the field */
    const barsTxt = uniform ? "" : E.barsText(sum);
    if (barsTxt) note.appendChild(E.el("span", { class: "field-bars", text: " Bars tonight, in points: " + barsTxt + "." }));
    if (!watchLabelled) note.appendChild(E.el("span", { class: "field-bars", text: " The dashed line is watch, halfway to the bar." }));
    if (noModel) note.appendChild(E.el("span", { class: "field-nomodel", text: " " + noModel + (noModel === 1 ? " side has" : " sides have") + " no model yet and no edge." }));
    /* a game that has started leaves the field; say so rather than let its stars vanish */
    if (sum.started) note.appendChild(E.el("span", { class: "field-nomodel", text: " " + E.startedNote(sum) }));
    const foot = E.el("div", { class: "field-foot" }, [legend, note]);
    host.appendChild(foot);

    /* draw-in once the field scrolls into view */
    if (!reduceMotion && "IntersectionObserver" in window) {
      const io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { svg.classList.add("animate"); io.disconnect(); } });
      }, { threshold: 0.2 });
      io.observe(host);
    }
    return { sides: data.length, games: sum.games || 0, picks: picks, watch: watching, unmodelled: noModel, started: sum.started, best: best ? best.r : null, bar: uniform ? oneBar : null, uniform: uniform };
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
    const draw = function (force) {
      const narrow = host.clientWidth > 0 && host.clientWidth < 560;
      if (narrow === wasNarrow && force !== true) return;
      wasNarrow = narrow;
      const out = render(host, opts);
      if (opts && typeof opts.onRender === "function") opts.onRender(out);
    };
    draw();
    window.addEventListener("resize", function () { clearTimeout(timer); timer = setTimeout(draw, 150); });
    /* a game that starts leaves the field at the next minute's check */
    if (window.EdgeLine.onStateChange) window.EdgeLine.onStateChange(function () { draw(true); });
  }

  window.EdgeLineField = { render: render, mount: mount, rows: rows };
})();
