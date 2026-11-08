/* On this page: the sticky strip of section links. Marks the section in view and keeps anchors clear of the header. */
(function () {
  var nav = document.querySelector(".subnav"); if (!nav) return;
  var header = document.querySelector(".site-header");
  function headerH() { if (!header) return 0; var pos = getComputedStyle(header).position; return pos === "sticky" || pos === "fixed" ? header.offsetHeight : 0; }
  function setH() { document.documentElement.style.setProperty("--header-h", headerH() + "px"); }
  setH(); window.addEventListener("resize", setH);
  var links = Array.prototype.slice.call(nav.querySelectorAll("a[href^='#']"));
  /* targets are looked up on each pass and skipped while hidden: the game page builds its sections after load and hides
     the ones a game does not have */
  function current() {
    var line = headerH() + 80, best = -1;
    links.forEach(function (a, i) { var t = a.hidden ? null : document.getElementById(a.getAttribute("href").slice(1)); if (t && t.getClientRects().length && t.getBoundingClientRect().top <= line) best = i; });
    links.forEach(function (a, i) { if (i === best) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current"); });
    if (best >= 0) { var a = links[best], r = a.getBoundingClientRect(), n = nav.getBoundingClientRect(); var sc = nav.querySelector(".subnav-in") || nav; if (r.left < n.left || r.right > n.right) sc.scrollLeft += r.left - n.left - 12; }
  }
  var ticking = false;
  window.addEventListener("scroll", function () { if (ticking) return; ticking = true; requestAnimationFrame(function () { ticking = false; current(); }); }, { passive: true });
  current();
})();
