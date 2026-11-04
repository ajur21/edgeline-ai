/* ==========================================================================
   EdgeLine AI — lightweight SVG charts (no dependencies)
   lineChart: single-series cumulative line with crosshair tooltip + table view
   barChart:  single-series bars from a zero baseline with hover tooltip
   ========================================================================== */
(function () {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  let gradSeq = 0;
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
  function niceTicks(min, max, count) {
    const span = max - min || 1;
    const rough = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(rough)));
    const norm = rough / mag;
    const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
    const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
    const out = [];
    for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 1000) / 1000);
    return out;
  }
  function fmtDate(iso) {
    const str = String(iso);
    const d = new Date(/T/.test(str) ? str : str + "T00:00:00");
    if (isNaN(d)) return str;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  function signed(n, d) {
    let v = Number(n).toFixed(d == null ? 1 : d);
    if (/^-0(\.0+)?$/.test(v)) v = v.slice(1);
    return (n > 0 ? "+" : "") + v;
  }
  /* one decimal on tick labels when the step is fractional, otherwise none */
  function tickDecimals(ticks) { return ticks.length > 1 && Math.abs(ticks[1] - ticks[0]) < 1 ? 1 : 0; }
  /* add .animate to the svg once it scrolls into view so draw-in animations run when seen */
  function whenVisible(svg) {
    if (!("IntersectionObserver" in window)) { svg.classList.add("animate"); return; }
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { svg.classList.add("animate"); io.disconnect(); } });
    }, { threshold: 0.2 });
    io.observe(svg);
  }
  function emptyState(container, msg) {
    const p = document.createElement("p"); p.className = "chart-empty"; p.textContent = msg;
    container.appendChild(p);
    return null;
  }

  function tooltipEl(container) {
    let tt = container.querySelector(".tooltip");
    if (!tt) {
      tt = document.createElement("div");
      tt.className = "tooltip"; tt.hidden = true;
      tt.appendChild(Object.assign(document.createElement("div"), { className: "tt-date" }));
      const row = document.createElement("div"); row.className = "tt-row";
      row.appendChild(Object.assign(document.createElement("span"), { className: "tt-key" }));
      row.appendChild(Object.assign(document.createElement("span"), { className: "tt-val" }));
      row.appendChild(Object.assign(document.createElement("span"), { className: "tt-name" }));
      tt.appendChild(row);
      container.appendChild(tt);
    }
    return tt;
  }
  function showTip(tt, x, y, date, val, name) {
    tt.querySelector(".tt-date").textContent = date;
    tt.querySelector(".tt-val").textContent = val;
    tt.querySelector(".tt-name").textContent = name;
    tt.style.left = x + "px"; tt.style.top = y + "px";
    tt.hidden = false;
  }

  /* ---------- line chart ---------- */
  function lineChart(container, points, opts) {
    opts = opts || {};
    points = (points || []).map(function (p) { return { x: p && p.x, y: Number(p && p.y) }; })
      .filter(function (p) { return Number.isFinite(p.y); });
    if (points.length < 2) return emptyState(container, "Not enough data to chart yet.");
    const W = 720, H = 260, padL = 44, padR = 56, padT = 16, padB = 32;
    const ys = points.map(function (p) { return p.y; });
    const yTicks = niceTicks(Math.min(0, Math.min.apply(null, ys)), Math.max(0, Math.max.apply(null, ys)), 4);
    let yMin = yTicks[0], yMax = yTicks[yTicks.length - 1];
    if (yMax === yMin) { yMin -= 1; yMax += 1; }
    const dec = tickDecimals(yTicks);
    const sx = function (i) { return padL + (i / (points.length - 1)) * (W - padL - padR); };
    const sy = function (v) { return padT + (1 - (v - yMin) / (yMax - yMin)) * (H - padT - padB); };

    const svg = s("svg", { viewBox: "0 0 " + W + " " + H, role: "group", "aria-label": opts.ariaLabel || "Line chart" });
    yTicks.forEach(function (v) {
      svg.appendChild(s("line", { x1: padL, x2: W - padR, y1: sy(v), y2: sy(v), class: v === 0 ? "axis" : "gridline" }));
      svg.appendChild(text(padL - 8, sy(v) + 4, signed(v, dec), "tick", "end"));
    });
    const xIdx = [0, Math.floor(points.length / 3), Math.floor(2 * points.length / 3), points.length - 1];
    xIdx.forEach(function (i) { svg.appendChild(text(sx(i), H - 10, fmtDate(points[i].x), "tick", i === 0 ? "start" : i === points.length - 1 ? "end" : "middle")); });

    const path = points.map(function (p, i) { return (i ? "L" : "M") + sx(i).toFixed(1) + " " + sy(p.y).toFixed(1); }).join(" ");
    /* vertical fade under the line; stop colours come from CSS tokens */
    const gid = "area-grad-" + (++gradSeq);
    const defs = s("defs"), grad = s("linearGradient", { id: gid, x1: "0", y1: "0", x2: "0", y2: "1" });
    grad.appendChild(s("stop", { offset: "0", class: "area-stop-1" }));
    grad.appendChild(s("stop", { offset: "1", class: "area-stop-2" }));
    defs.appendChild(grad); svg.appendChild(defs);
    svg.appendChild(s("path", { d: path + " L" + sx(points.length - 1).toFixed(1) + " " + sy(0).toFixed(1) + " L" + sx(0).toFixed(1) + " " + sy(0).toFixed(1) + " Z", class: "area", fill: "url(#" + gid + ")" }));
    svg.appendChild(s("path", { d: path, class: "line", pathLength: "1" }));
    const last = points[points.length - 1];
    svg.appendChild(s("circle", { cx: sx(points.length - 1), cy: sy(last.y), r: 4, class: "end-dot" }));
    svg.appendChild(text(sx(points.length - 1) + 10, sy(last.y) + 4, signed(last.y, 1) + (opts.unit ? opts.unit : ""), "end-label"));

    const cross = s("line", { x1: 0, x2: 0, y1: padT, y2: H - padB, class: "crosshair", visibility: "hidden" });
    const hdot = s("circle", { r: 4, class: "hover-dot", visibility: "hidden" });
    svg.appendChild(cross); svg.appendChild(hdot);
    const hit = s("rect", { x: padL, y: 0, width: W - padL - padR, height: H, class: "hit", tabindex: "0",
      role: "slider", "aria-orientation": "horizontal",
      "aria-label": (opts.ariaLabel || "Line chart") + ". Arrow keys step through points.",
      "aria-valuemin": "0", "aria-valuemax": String(points.length - 1), "aria-valuenow": String(points.length - 1),
      "aria-valuetext": fmtDate(last.x) + ": " + signed(last.y, 2) + (opts.unit ? opts.unit : "") });
    svg.appendChild(hit);

    const tt = tooltipEl(container);
    let active = -1;
    function setActive(i, rect) {
      active = i;
      if (i < 0) { cross.setAttribute("visibility", "hidden"); hdot.setAttribute("visibility", "hidden"); tt.hidden = true; return; }
      const p = points[i];
      hit.setAttribute("aria-valuenow", String(i));
      hit.setAttribute("aria-valuetext", fmtDate(p.x) + ": " + signed(p.y, 2) + (opts.unit ? opts.unit : ""));
      cross.setAttribute("x1", sx(i)); cross.setAttribute("x2", sx(i)); cross.setAttribute("visibility", "visible");
      hdot.setAttribute("cx", sx(i)); hdot.setAttribute("cy", sy(p.y)); hdot.setAttribute("visibility", "visible");
      const scale = rect.width / W;
      showTip(tt, sx(i) * scale, sy(p.y) * scale, fmtDate(p.x), signed(p.y, 2) + (opts.unit ? opts.unit : ""), opts.seriesName || "");
    }
    hit.addEventListener("pointermove", function (e) {
      const rect = svg.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width * W;
      const i = Math.round((px - padL) / (W - padL - padR) * (points.length - 1));
      setActive(Math.max(0, Math.min(points.length - 1, i)), rect);
    });
    hit.addEventListener("pointerleave", function () { if (document.activeElement !== hit) setActive(-1); });
    hit.addEventListener("focus", function () { setActive(active < 0 ? points.length - 1 : active, svg.getBoundingClientRect()); });
    hit.addEventListener("blur", function () { setActive(-1); });
    hit.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") { e.preventDefault(); setActive(Math.max(0, active - 1), svg.getBoundingClientRect()); }
      if (e.key === "ArrowRight") { e.preventDefault(); setActive(Math.min(points.length - 1, active + 1), svg.getBoundingClientRect()); }
      if (e.key === "Home") { e.preventDefault(); setActive(0, svg.getBoundingClientRect()); }
      if (e.key === "End") { e.preventDefault(); setActive(points.length - 1, svg.getBoundingClientRect()); }
    });

    container.appendChild(svg);
    whenVisible(svg);
    return svg;
  }

  /* ---------- bar chart ---------- */
  function barChart(container, items, opts) {
    opts = opts || {};
    items = (items || []).map(function (d) { return { label: String(d && d.label), sub: d && d.sub, value: Number(d && d.value) }; })
      .filter(function (d) { return Number.isFinite(d.value); });
    if (!items.length) return emptyState(container, "Not enough data to chart yet.");
    const W = 720, padL = 44, padR = 16, padT = 20, padB = 48, band = 64, barW = 24;
    const H = padT + padB + Math.max(120, band * 2.4);
    const vals = items.map(function (d) { return d.value; });
    const yTicks = niceTicks(Math.min(0, Math.min.apply(null, vals)), Math.max(0, Math.max.apply(null, vals)), 4);
    let yMin = yTicks[0], yMax = yTicks[yTicks.length - 1];
    if (yMax === yMin) { yMin -= 1; yMax += 1; }
    const dec = tickDecimals(yTicks);
    const plotW = W - padL - padR, slot = plotW / items.length;
    const sy = function (v) { return padT + (1 - (v - yMin) / (yMax - yMin)) * (H - padT - padB); };
    const svg = s("svg", { viewBox: "0 0 " + W + " " + H, role: "group", "aria-label": opts.ariaLabel || "Bar chart" });
    yTicks.forEach(function (v) {
      svg.appendChild(s("line", { x1: padL, x2: W - padR, y1: sy(v), y2: sy(v), class: v === 0 ? "axis" : "gridline" }));
      svg.appendChild(text(padL - 8, sy(v) + 4, signed(v, dec), "tick", "end"));
    });
    const tt = tooltipEl(container);
    items.forEach(function (d, i) {
      const cx = padL + slot * i + slot / 2;
      const y0 = sy(0), y1 = sy(d.value);
      const top = Math.min(y0, y1), h = Math.abs(y1 - y0);
      const r = Math.min(4, h);
      /* rounded data-end, square at baseline */
      let path;
      const x = cx - barW / 2;
      if (d.value >= 0) {
        path = "M" + x + " " + y0 + " V" + (top + r) + " Q" + x + " " + top + " " + (x + r) + " " + top +
          " H" + (x + barW - r) + " Q" + (x + barW) + " " + top + " " + (x + barW) + " " + (top + r) + " V" + y0 + " Z";
      } else {
        const bot = top + h;
        path = "M" + x + " " + y0 + " V" + (bot - r) + " Q" + x + " " + bot + " " + (x + r) + " " + bot +
          " H" + (x + barW - r) + " Q" + (x + barW) + " " + bot + " " + (x + barW) + " " + (bot - r) + " V" + y0 + " Z";
      }
      const bar = s("path", { d: path, class: "bar" + (d.value < 0 ? " bar-neg" : ""), "data-cat": d.label, tabindex: "0", role: "img", "aria-label": d.label + ": " + signed(d.value, 2) + (opts.unit ? opts.unit : "") });
      bar.style.setProperty("--i", i);
      svg.appendChild(bar);
      svg.appendChild(text(cx, d.value >= 0 ? top - 6 : top + h + 15, signed(d.value, 1), "bar-label", "middle"));
      svg.appendChild(text(cx, H - 8, d.label, "cat-label", "middle"));
      function show() {
        const rect = svg.getBoundingClientRect(), scale = rect.width / W;
        showTip(tt, cx * scale, top * scale, d.label + (d.sub ? " · " + d.sub : ""), signed(d.value, 2) + (opts.unit ? opts.unit : ""), opts.seriesName || "");
      }
      bar.addEventListener("pointerenter", show);
      bar.addEventListener("focus", show);
      bar.addEventListener("pointerleave", function () { tt.hidden = true; });
      bar.addEventListener("blur", function () { tt.hidden = true; });
    });
    container.appendChild(svg);
    whenVisible(svg);
    return svg;
  }

  /* ---------- table twin ---------- */
  function dataTable(headers, rows, label) {
    const tbl = document.createElement("table"); tbl.className = "data";
    const thead = document.createElement("thead"); const tr = document.createElement("tr");
    headers.forEach(function (h) { const th = document.createElement("th"); th.scope = "col"; th.textContent = h.label; if (h.num) th.className = "num"; tr.appendChild(th); });
    thead.appendChild(tr); tbl.appendChild(thead);
    const tbody = document.createElement("tbody");
    rows.forEach(function (r) {
      const tr2 = document.createElement("tr");
      r.forEach(function (c, i) { const td = document.createElement("td"); td.textContent = c; if (headers[i].num) td.className = "num"; tr2.appendChild(td); });
      tbody.appendChild(tr2);
    });
    tbl.appendChild(tbody);
    const wrap = document.createElement("div"); wrap.className = "table-wrap chart-table"; wrap.hidden = true; wrap.appendChild(tbl);
    wrap.tabIndex = 0;
    if (label) { wrap.setAttribute("role", "region"); wrap.setAttribute("aria-label", label); }
    return wrap;
  }

  window.EdgeLineCharts = { lineChart: lineChart, barChart: barChart, dataTable: dataTable, fmtDate: fmtDate };
})();
