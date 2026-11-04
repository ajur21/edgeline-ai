/* ==========================================================================
   EdgeLine AI — galaxy backdrop
   A fixed canvas behind the page. A Milky Way band (thousands of faint stars,
   luminous haze with a bright core, dark dust lanes, star clusters) is drawn
   once to an offscreen layer and scrolled with parallax. On top: twinkling
   foreground stars, a few bright stars with glow, occasional shooting stars,
   and a cinematic vignette. Light theme: a pale daylight sky with faint stars.
   Reduced motion: one still frame, redrawn only on resize, scroll or theme.
   ========================================================================== */
(function () {
  "use strict";
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const root = document.documentElement;
  let canvas, ctx, layer, lctx, W = 0, H = 0, LH = 0, dpr = 1;
  let fg = [], bright = [], shooting = null, nextShot = 0, raf = 0, running = false, lastT = 0, layerTheme = "";
  let scrollY = 0, mouseX = 0.5, mouseY = 0.5;

  function isLight() { return root.getAttribute("data-theme") === "light"; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function rgba(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a.toFixed(3) + ")"; }

  /* ---------- the galaxy layer (static, rebuilt on resize / theme) ---------- */
  function buildLayer() {
    const light = isLight();
    layerTheme = light ? "light" : "dark";
    LH = Math.round(H * 1.6);
    layer.width = Math.round(W * dpr); layer.height = Math.round(LH * dpr);
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lctx.clearRect(0, 0, W, LH);

    /* band geometry: a line through (cx, cy) at angle `ang`, half-width `hw` */
    const R = Math.max(W, LH), ang = -0.42, hw = R * 0.16;
    const cx = W * 0.55, cy = LH * 0.42;
    const ux = Math.cos(ang), uy = Math.sin(ang);          /* along the band */
    const nx = -uy, ny = ux;                               /* across the band */
    function along(t, d) { return [cx + ux * t + nx * d, cy + uy * t + ny * d]; }
    const span = R * 1.4;

    if (!light) {
      /* faint colour washes for depth */
      lctx.globalCompositeOperation = "lighter";
      [[0.85, 0.15, 0.6, [30, 70, 200], 0.10], [0.1, 0.9, 0.5, [150, 40, 120], 0.08]].forEach(function (n) {
        const g = lctx.createRadialGradient(n[0] * W, n[1] * LH, 0, n[0] * W, n[1] * LH, n[2] * R);
        g.addColorStop(0, rgba(n[3], n[4])); g.addColorStop(1, rgba(n[3], 0));
        lctx.fillStyle = g; lctx.fillRect(0, 0, W, LH);
      });

      /* haze: many soft blobs along the band, denser and warmer toward the core */
      for (let i = 0; i < 190; i++) {
        const t = (Math.random() - 0.5) * span, d = gauss() * hw * 0.55;
        const p = along(t, d);
        const core = Math.exp(-(t * t) / (2 * (R * 0.22) * (R * 0.22)));
        const r = rand(60, 200) * (0.7 + core * 0.8);
        const warm = Math.random() < 0.22 + core * 0.4;
        const roll = Math.random();
        const col = warm ? [255, 210, 175] : roll < 0.3 ? [170, 110, 255] : roll < 0.45 ? [255, 120, 200] : roll < 0.6 ? [60, 190, 255] : [175, 200, 255];
        const a = (0.05 + core * 0.09) * rand(0.6, 1.2);
        const g = lctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r);
        g.addColorStop(0, rgba(col, a)); g.addColorStop(0.5, rgba(col, a * 0.4)); g.addColorStop(1, rgba(col, 0));
        lctx.fillStyle = g; lctx.fillRect(p[0] - r, p[1] - r, r * 2, r * 2);
      }
      /* the bulge */
      const bulge = lctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.26);
      bulge.addColorStop(0, "rgba(255,230,200,0.22)"); bulge.addColorStop(0.3, "rgba(255,215,190,0.10)"); bulge.addColorStop(1, "rgba(255,215,190,0)");
      lctx.fillStyle = bulge; lctx.fillRect(0, 0, W, LH);
    }

    /* stars: most sit in the band (gaussian across it), the rest are scattered */
    lctx.globalCompositeOperation = "source-over";
    const count = Math.min(9000, Math.round((W * LH) / (light ? 900 : 260)));
    for (let i = 0; i < count; i++) {
      let x, y;
      if (Math.random() < 0.78) { const p = along((Math.random() - 0.5) * span, gauss() * hw * 0.7); x = p[0]; y = p[1]; }
      else { x = Math.random() * W; y = Math.random() * LH; }
      if (x < -2 || x > W + 2 || y < -2 || y > LH + 2) continue;
      const s = Math.random();
      const r = s < 0.8 ? rand(0.25, 0.7) : s < 0.97 ? rand(0.7, 1.2) : rand(1.2, 1.9);
      const a = light ? rand(0.18, 0.45) : rand(0.35, 1);
      const c = Math.random();
      const col = light ? [40, 60, 110] : c < 0.1 ? [255, 210, 170] : c < 0.3 ? [180, 205, 255] : c < 0.33 ? [255, 170, 215] : [255, 255, 255];
      lctx.fillStyle = rgba(col, a);
      if (r < 0.7) lctx.fillRect(x, y, r * 1.6, r * 1.6);
      else { lctx.beginPath(); lctx.arc(x, y, r, 0, Math.PI * 2); lctx.fill(); }
    }

    if (!light) {
      /* star clusters: tight knots with a glow */
      for (let k = 0; k < 7; k++) {
        const p = along((Math.random() - 0.5) * span * 0.8, gauss() * hw * 0.6), rr = rand(18, 40);
        const g = lctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], rr * 2.2);
        g.addColorStop(0, "rgba(200,220,255,0.18)"); g.addColorStop(1, "rgba(200,220,255,0)");
        lctx.fillStyle = g; lctx.fillRect(p[0] - rr * 2.2, p[1] - rr * 2.2, rr * 4.4, rr * 4.4);
        for (let j = 0; j < 45; j++) {
          const x = p[0] + gauss() * rr * 0.5, y = p[1] + gauss() * rr * 0.5;
          lctx.fillStyle = rgba([255, 255, 255], rand(0.4, 1)); lctx.fillRect(x, y, 1, 1);
        }
      }
      /* dust lanes: dark elongated patches that cut the band */
      lctx.globalCompositeOperation = "source-over";
      for (let i = 0; i < 34; i++) {
        const t = (Math.random() - 0.5) * span * 0.9, d = gauss() * hw * 0.35;
        const p = along(t, d), r = rand(40, 110), stretch = rand(2.2, 4.5);
        lctx.save();
        lctx.translate(p[0], p[1]); lctx.rotate(ang + gauss() * 0.15); lctx.scale(stretch, 1);
        const g = lctx.createRadialGradient(0, 0, 0, 0, 0, r);
        g.addColorStop(0, "rgba(6,9,19,0.62)"); g.addColorStop(0.6, "rgba(6,9,19,0.3)"); g.addColorStop(1, "rgba(6,9,19,0)");
        lctx.fillStyle = g; lctx.fillRect(-r, -r, r * 2, r * 2);
        lctx.restore();
      }
    }

    /* bright stars with glow, drawn live so they can breathe */
    bright = [];
    for (let i = 0; i < 16; i++) bright.push({ x: Math.random() * W, y: Math.random() * LH, r: rand(1.4, 2.6), phase: Math.random() * 6.28, speed: rand(0.4, 1), col: Math.random() < 0.3 ? [255, 215, 180] : Math.random() < 0.5 ? [190, 210, 255] : [255, 255, 255] });
  }

  /* foreground twinkle stars: few, larger, strongest parallax */
  function seedForeground() {
    fg = [];
    const n = Math.min(220, Math.round((W * H) / 7000));
    for (let i = 0; i < n; i++) fg.push({ x: Math.random() * W, y: Math.random() * H * 1.4, r: rand(0.8, 1.7), base: rand(0.5, 0.95), phase: Math.random() * 6.28, speed: rand(0.6, 1.8) });
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildLayer(); seedForeground();
    if (reduce) draw(0);
  }

  function layerOffset() { return -Math.min(scrollY * 0.14, LH - H) - (mouseY - 0.5) * 10; }

  function drawBright(t, light, oy) {
    for (let i = 0; i < bright.length; i++) {
      const b = bright[i], y = b.y + oy, x = b.x + (mouseX - 0.5) * 12;
      if (y < -40 || y > H + 40) continue;
      const tw = reduce ? 1 : 0.8 + 0.2 * Math.sin(t * 0.0011 * b.speed + b.phase);
      const a = (light ? 0.3 : 0.95) * tw;
      const g = ctx.createRadialGradient(x, y, 0, x, y, b.r * 9);
      g.addColorStop(0, rgba(b.col, a)); g.addColorStop(0.18, rgba(b.col, a * 0.5)); g.addColorStop(1, rgba(b.col, 0));
      ctx.fillStyle = g; ctx.fillRect(x - b.r * 9, y - b.r * 9, b.r * 18, b.r * 18);
      ctx.fillStyle = rgba(light ? [40, 60, 110] : [255, 255, 255], a);
      ctx.beginPath(); ctx.arc(x, y, b.r * 0.9, 0, Math.PI * 2); ctx.fill();
      if (!light) {
        ctx.fillStyle = rgba(b.col, a * 0.35);
        ctx.fillRect(x - b.r * 6, y - 0.5, b.r * 12, 1); ctx.fillRect(x - 0.5, y - b.r * 6, 1, b.r * 12);
      }
    }
  }

  function drawForeground(t, light) {
    const span = H * 1.4;
    for (let i = 0; i < fg.length; i++) {
      const s = fg[i];
      let y = (s.y - scrollY * 0.3) % span; if (y < 0) y += span;
      const x = s.x + (mouseX - 0.5) * 22;
      const tw = reduce ? 1 : 0.65 + 0.35 * Math.sin(t * 0.0016 * s.speed + s.phase);
      ctx.fillStyle = light ? rgba([40, 60, 110], s.base * 0.35 * tw) : rgba([255, 255, 255], s.base * tw);
      ctx.beginPath(); ctx.arc(x, y, s.r, 0, Math.PI * 2); ctx.fill();
    }
  }

  function shootingStar(t, dt, light) {
    if (reduce) return;
    if (!shooting && t > nextShot) {
      const fromLeft = Math.random() < 0.5;
      shooting = { x: fromLeft ? rand(-50, W * 0.4) : rand(W * 0.6, W + 50), y: rand(-20, H * 0.5), vx: (fromLeft ? 1 : -1) * rand(520, 820), vy: rand(160, 340), life: 0, max: rand(0.6, 1.0) };
    }
    if (!shooting) return;
    shooting.life += dt; shooting.x += shooting.vx * dt; shooting.y += shooting.vy * dt;
    const k = shooting.life / shooting.max, a = (light ? 0.5 : 1) * Math.sin(Math.PI * Math.min(1, k));
    const len = Math.hypot(shooting.vx, shooting.vy), nx = shooting.vx / len, ny = shooting.vy / len, tail = 160;
    const g = ctx.createLinearGradient(shooting.x - nx * tail, shooting.y - ny * tail, shooting.x, shooting.y);
    g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(1, "rgba(255,255,255," + a + ")");
    ctx.strokeStyle = g; ctx.lineWidth = 1.5; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(shooting.x - nx * tail, shooting.y - ny * tail); ctx.lineTo(shooting.x, shooting.y); ctx.stroke();
    if (k >= 1) { shooting = null; nextShot = t + rand(5000, 11000); }
  }

  function vignette(light) {
    const g = ctx.createRadialGradient(W * 0.5, H * 0.4, Math.min(W, H) * 0.3, W * 0.5, H * 0.5, Math.max(W, H) * 0.8);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, light ? "rgba(40,60,110,0.10)" : "rgba(0,0,0,0.55)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  function draw(t) {
    const light = isLight();
    if ((light ? "light" : "dark") !== layerTheme) buildLayer();
    const dt = Math.min(0.05, (t - lastT) / 1000) || 0; lastT = t;
    ctx.clearRect(0, 0, W, H);
    const oy = layerOffset();
    ctx.globalAlpha = light ? 0.9 : 1;
    ctx.drawImage(layer, (mouseX - 0.5) * -8, oy, W, LH);
    ctx.globalAlpha = 1;
    drawBright(t, light, oy);
    drawForeground(t, light);
    shootingStar(t, dt, light);
    vignette(light);
  }
  function loop(t) { if (!running) return; draw(t); raf = requestAnimationFrame(loop); }
  function start() { if (reduce || running) return; running = true; raf = requestAnimationFrame(loop); }
  function stop() { running = false; cancelAnimationFrame(raf); }

  function init() {
    canvas = document.createElement("canvas"); canvas.id = "space"; canvas.setAttribute("aria-hidden", "true");
    ctx = canvas.getContext("2d");
    layer = document.createElement("canvas"); lctx = layer.getContext("2d");
    if (!ctx || !lctx) return;
    document.body.prepend(canvas);
    resize();
    let rt; window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(resize, 120); });
    window.addEventListener("scroll", function () { scrollY = window.scrollY || 0; if (reduce) draw(0); }, { passive: true });
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      window.addEventListener("pointermove", function (e) { mouseX = e.clientX / W; mouseY = e.clientY / H; }, { passive: true });
    }
    new MutationObserver(function () { if (reduce) draw(0); }).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    document.addEventListener("visibilitychange", function () { document.hidden ? stop() : start(); });
    nextShot = 2000;
    start();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
