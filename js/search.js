/* ==========================================================================
   EdgeLine AI — site search (owner ask, 2026-11-04: "search through any
   search or by team or sport, how other sportsbooks let you look through to
   place a bet"). One box on every page, opened from the header button, "/"
   or Ctrl/Cmd+K. It finds sports, the games on the board, picks, teams and
   players, and sends each to where it can be bet or read: the Games page
   filtered to a sport or a team (or one game), a pick's card, the props page.
   Data files a page does not carry load on first open. Every string goes in
   through EdgeLine.el (textContent), never HTML. Exposes window.EdgeLineSearch.
   ========================================================================== */
(function () {
  "use strict";
  const FILES = [["MARKET_DATA", "data/market.js"], ["PICKS_DATA", "data/picks.js"], ["TEAMS_DATA", "data/teams.js"], ["FACES_DATA", "data/faces.js"]];
  const SPORT_WORDS = { NBA: "basketball", NHL: "hockey ice hockey", NFL: "football american football", NCAAF: "college football ncaaf cfb ncaa", MLB: "baseball", Soccer: "soccer football premier league epl la liga mls major league soccer" };
  const SPORT_LABEL = { NCAAF: "College football" };
  /* college football (2026-11-08): the short names fans type. Ambiguous ones stay apart: "USC" is Southern California only
     (South Carolina is "SC"), "Miami" finds both Miami (FL) and Miami (OH), "Miami Ohio" / "Miami OH" only the RedHawks,
     "MSU" and "OSU" both of their schools */
  const COLLEGE = [[/^usc\b|southern cal/, "usc southern california socal trojans"], [/^south carolina/, "sc gamecocks"], [/^miami (fl|florida|hurricanes)|^miami hurricanes/, "miami fl canes hurricanes"],
    [/^miami (oh|ohio)/, "miami ohio oh redhawks"], [/^ole miss|^mississippi rebels/, "ole miss mississippi"], [/^lsu|louisiana state/, "lsu louisiana state"], [/^tcu|texas christian/, "tcu texas christian"],
    [/^smu|southern methodist/, "smu southern methodist"], [/^byu|brigham young/, "byu brigham young"], [/^ucf|central florida/, "ucf central florida"], [/^uconn|connecticut/, "uconn connecticut"],
    [/^pittsburgh panthers|^pitt\b/, "pitt pittsburgh"], [/^unlv|nevada las vegas/, "unlv"], [/^texas a ?m|^texas a and m/, "tamu texas a m aggies"], [/^north carolina tar heels|^unc\b/, "unc tar heels"],
    [/^nc state|north carolina state/, "nc state ncsu wolfpack"], [/^penn state/, "psu penn state"], [/^ohio state/, "osu ohio state buckeyes"], [/^oklahoma state/, "osu okstate cowboys"],
    [/^michigan state/, "msu michigan state spartans"], [/^mississippi state/, "msu miss state bulldogs"], [/^florida state/, "fsu florida state seminoles"], [/^georgia tech/, "gt georgia tech"],
    [/^virginia tech/, "vt hokies"], [/^kansas state/, "ksu k state wildcats"], [/^iowa state/, "isu iowa state cyclones"], [/^utsa|texas san antonio/, "utsa"], [/^utep|texas el paso/, "utep"],
    [/^uab|alabama birmingham/, "uab"], [/^fiu|florida international/, "fiu"], [/^fau|florida atlantic/, "fau"], [/^umass|massachusetts/, "umass"], [/^ul monroe|louisiana monroe/, "ulm"]];
  function collegeWords(name) { const n = norm(name); return COLLEGE.filter(function (c) { return c[0].test(n); }).map(function (c) { return c[1]; }).join(" "); }
  /* the "pick" group is titled by the site's wording switch (EdgeLine.word: "Leans" while data/replay.js says leans) */
  const GROUPS = [["sport", "Sports"], ["game", "Games"], ["pick", null], ["team", "Teams"], ["player", "Players"]];
  function groupTitle(g) { return g[1] || E().word("Many"); }
  const PER_GROUP = { sport: 4, game: 5, pick: 5, team: 5, player: 5 };
  let dlg = null, input = null, list = null, opener = null, index = null, ready = null, active = -1;

  function E() { return window.EdgeLine; }
  function TM() { return window.EdgeLineTeams || null; }

  /* ---------- data: load what this page does not carry ---------- */
  function script(src) {
    return new Promise(function (resolve) {
      const s = document.createElement("script"); s.src = src;
      s.onload = s.onerror = function () { resolve(); };
      document.head.appendChild(s);
    });
  }
  function ensureData() {
    if (!ready) {
      ready = Promise.all(FILES.filter(function (f) { return !window[f[0]]; }).map(function (f) { return script(f[1]); }))
        .then(function () { return TM() ? null : script("js/teams.js"); })
        .then(function () { index = null; });
    }
    return ready;
  }

  /* ---------- matching: every word typed has to start a word of the entry ---------- */
  function norm(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9+]+/g, " ").trim(); }
  function entry(kind, title, sub, href, text, boost, extra) {
    const words = norm(text).split(" ").filter(Boolean);
    return Object.assign({ kind: kind, title: title, sub: sub, href: href, words: words, flat: words.join(" "), boost: boost || 0 }, extra || {});
  }
  function score(e, q) {
    let total = 0;
    for (let i = 0; i < q.length; i++) {
      let best = 0;
      for (let j = 0; j < e.words.length; j++) { const w = e.words[j]; if (w === q[i]) { best = 3; break; } if (w.indexOf(q[i]) === 0) best = Math.max(best, 2); }
      if (!best && q[i].length >= 3 && e.flat.indexOf(q[i]) >= 0) best = 1;
      if (!best) return 0;
      total += best;
    }
    return total + e.boost;
  }
  function alias(t) { return t ? [t.name, t.short, t.nick, t.location, t.abbr].concat(t.aka || []).filter(Boolean).join(" ") : ""; } /* aka: the odds feed's other spellings (college football, data/teams.js) */

  /* ---------- the index: built from whatever data is loaded ---------- */
  function build() {
    const Ed = E(), tm = TM(), M = window.MARKET_DATA || { rows: [] }, P = window.PICKS_DATA || { picks: [] }, T = window.TEAMS_DATA, F = window.FACES_DATA;
    const onBoard = {}; (P.picks || []).forEach(function (p) { onBoard[p.id] = p; });
    const out = [], games = {}, order = [], teamGame = {}, sports = {}, collegeSeen = {};
    (M.rows || []).forEach(function (r) { if (!games[r.eventId]) { games[r.eventId] = { r: r, rows: [] }; order.push(r.eventId); } games[r.eventId].rows.push(r); });
    order.forEach(function (id) {
      const g = games[id], r = g.r, key = r.sportKey || r.sport;
      const home = tm ? tm.find(key, r.home) : null, away = tm ? tm.find(key, r.away) : null;
      /* a game that has started is still found, marked by where it stands; only an open game counts toward the board */
      const st = Ed.gameState(r), open = st === "upcoming" || st === "soon";
      const picks = open ? g.rows.filter(function (x) { return x.pickId && onBoard[x.pickId]; }).length : 0;
      [home, away].forEach(function (t, i) { if (t) teamGame[(r.sportKey || "") + "|" + t.id] = { g: g, opp: i === 0 ? r.away : r.home }; });
      const s = sports[r.sport] || (sports[r.sport] = { games: 0, picks: 0 }); if (open) s.games++; s.picks += picks;
      const college = r.sport === "NCAAF" ? [SPORT_WORDS.NCAAF, collegeWords(r.home), collegeWords(r.away)].join(" ") : "";
      /* a game opens its own page (2026-11-08): its lean, every side we priced, why and its props */
      out.push(entry("game", r.event, [SPORT_LABEL[r.sport] || r.sport, open ? r.start : st === "live" ? "Live now" : "Finished", picks ? (picks === 1 ? "a " + Ed.word("one") : Ed.nWord(picks)) + " on the board" : null], "game.html?id=" + encodeURIComponent(id),
        [r.event, r.home, r.away, r.sport, alias(home), alias(away), college].join(" "), picks ? 0.65 : 0.6, { row: r, home: home, away: away }));
      /* a college club data/teams.js does not resolve (an FCS or lower-division school the file leaves out): that side of the game is its own team result, on the Games page search */
      if (r.sport === "NCAAF") [[r.home, home, r.away], [r.away, away, r.home]].forEach(function (x) { if (!x[1] && x[0] && !collegeSeen[x[0]]) { collegeSeen[x[0]] = true; out.push(entry("team", x[0], ["College football", "vs " + x[2] + ", " + r.start], "games.html?q=" + encodeURIComponent(x[0]), [x[0], collegeWords(x[0]), "college football"].join(" "), 0.5, { team: null, name: x[0] })); } });
    });
    (P.picks || []).forEach(function (p) {
      if (!sports[p.sport]) sports[p.sport] = { games: 0, picks: 0 };
      const key = p.sportKey || p.sport, home = tm ? tm.find(key, p.home) : null, away = tm ? tm.find(key, p.away) : null;
      out.push(entry("pick", p.pick + " " + Ed.fmtOdds(p.odds), [p.sport, p.event, !Ed.isOpen(p) ? Ed.stateText(p) : p.confidence ? (Ed.tierLabel ? Ed.tierLabel(p.confidence) : p.confidence) + " confidence" : null], "picks.html#" + encodeURIComponent(p.id),
        [p.pick, p.event, p.home, p.away, p.sport, p.market, alias(home), alias(away)].join(" "), 0.3, { pick: p }));
    });
    if (T && T.leagues) Object.keys(T.leagues).forEach(function (key) {
      const lg = T.leagues[key];
      (lg.teams || []).forEach(function (t) {
        const tg = teamGame[key + "|" + t.id];
        /* college football (265 clubs since 2026-11-08) also answers to the sport's words and the short names fans type (COLLEGE) */
        const college = lg.sport === "NCAAF" ? SPORT_WORDS.NCAAF + " " + collegeWords(t.name) : "";
        out.push(entry("team", t.name, [SPORT_LABEL[lg.sport] || lg.sport, tg ? "vs " + tg.opp + ", " + tg.g.r.start : "no game on the board"], "games.html?team=" + encodeURIComponent(t.id) + "&league=" + encodeURIComponent(key),
          [alias(t), lg.sport, college].join(" "), tg ? 0.5 : 0, { team: t }));
      });
    });
    ((F && F.players) || []).forEach(function (pl) {
      out.push(entry("player", pl.name, ["NBA", pl.team || pl.abbr, pl.pos, pl.injury || null], "props.html?q=" + encodeURIComponent(pl.name),
        [pl.name, pl.team, pl.abbr].join(" "), Math.min(0.3, (Number(pl.pts) || 0) / 100), { player: pl }));
    });
    Object.keys(sports).forEach(function (sp) {
      const s = sports[sp];
      out.push(entry("sport", SPORT_LABEL[sp] || sp, [s.games + (s.games === 1 ? " game" : " games") + " on the board", s.picks ? Ed.nWord(s.picks) : "no " + Ed.word("many") + " yet"], "games.html?sport=" + encodeURIComponent(sp),
        sp + " " + (SPORT_WORDS[sp] || ""), 1, { sport: sp, count: s.games }));
    });
    return out;
  }
  /* results grouped by kind; the group holding the best match leads */
  function search(q) {
    if (!index) index = build();
    const words = norm(q).split(" ").filter(Boolean);
    if (!words.length) return suggestions();
    const groups = {};
    index.forEach(function (e) { const s = score(e, words); if (s > 0) (groups[e.kind] = groups[e.kind] || []).push({ e: e, s: s }); });
    return GROUPS.filter(function (g) { return groups[g[0]]; }).map(function (g, i) {
      const hits = groups[g[0]].sort(function (a, b) { return b.s - a.s; });
      return { kind: g[0], title: groupTitle(g), top: hits[0].s, order: i, items: hits.slice(0, PER_GROUP[g[0]]).map(function (h) { return h.e; }) };
    }).sort(function (a, b) { return (b.top - a.top) || (a.order - b.order); });
  }
  /* an empty box: the sports on the board, then tonight's picks in the site's order */
  function suggestions() {
    if (!index) index = build();
    const Ed = E(), out = [];
    const sports = index.filter(function (e) { return e.kind === "sport"; }).sort(function (a, b) { return b.count - a.count; });
    if (sports.length) out.push({ kind: "sport", title: "Sports on the board", items: sports });
    /* suggestions are bets: open games only */
    const picks = Ed.sortByProb(Ed.openOnly((window.PICKS_DATA && window.PICKS_DATA.picks) || [])).slice(0, 4);
    const byId = {}; index.forEach(function (e) { if (e.kind === "pick") byId[e.pick.id] = e; });
    const items = picks.map(function (p) { return byId[p.id]; }).filter(Boolean);
    if (items.length) out.push({ kind: "pick", title: Ed.word("Many") + ", likeliest first", items: items });
    return out;
  }

  /* ---------- the dialog ---------- */
  function icon(e) {
    const Ed = E(), tm = TM();
    if (e.kind === "sport") return Ed.el("span", { class: "badge badge-sport", "data-sport": e.sport, text: e.sport });
    if (e.kind === "team" && tm) return e.team ? tm.logo(e.team, e.title, 24) : tm.logo(null, e.name || e.title, 24);
    if (e.kind === "game" && tm) return Ed.el("span", { class: "search-pair" }, [tm.logo(e.away, e.row.away, 20), tm.logo(e.home, e.row.home, 20)]);
    if (e.kind === "pick" && tm && tm.sideLogo) return tm.sideLogo(e.pick, 24) || Ed.el("span", { class: "badge badge-sport", "data-sport": e.pick.sport, text: e.pick.sport });
    if (e.kind === "player" && tm && tm.face) return tm.face("basketball_nba", e.player, 24);
    return Ed.el("span", { class: "search-dot", "aria-hidden": "true" });
  }
  function render() {
    const Ed = E(), q = input.value, groups = search(q);
    list.textContent = ""; active = -1; input.removeAttribute("aria-activedescendant");
    let n = 0;
    groups.forEach(function (g, gi) {
      const gid = "search-g" + gi;
      list.appendChild(Ed.el("div", { class: "search-group", role: "group", "aria-labelledby": gid }, [
        Ed.el("p", { class: "search-group-title", id: gid, text: g.title })
      ].concat(g.items.map(function (e) {
        const id = "search-o" + (n++);
        return Ed.el("a", { class: "search-option", role: "option", id: id, href: e.href, "aria-selected": "false" }, [
          Ed.el("span", { class: "search-icon" }, [icon(e)]),
          Ed.el("span", { class: "search-text" }, [Ed.el("span", { class: "search-title", text: e.title }), Ed.meta(e.sub, "search-sub")])
        ]);
      }))));
    });
    if (!n) list.appendChild(Ed.el("p", { class: "search-empty", text: q.trim() ? "No sport, game, " + Ed.word("one") + ", team or player matches “" + q.trim() + "”." : "Loading the board…" }));
    list.appendChild(Ed.el("a", { class: "search-option search-all", role: "option", id: "search-o" + n, href: "games.html" + (q.trim() ? "?q=" + encodeURIComponent(q.trim()) : ""), "aria-selected": "false" }, [
      Ed.el("span", { class: "search-text" }, [Ed.el("span", { class: "search-title", text: q.trim() ? "Look for “" + q.trim() + "” on the Games page" : "Browse every game" })])
    ]));
    list.querySelectorAll(".search-option").forEach(function (a) { a.addEventListener("click", function () { close(); }); });
  }
  function move(step) {
    const opts = list.querySelectorAll(".search-option"); if (!opts.length) return;
    active = (active + step + opts.length) % opts.length;
    opts.forEach(function (o, i) { o.setAttribute("aria-selected", String(i === active)); });
    input.setAttribute("aria-activedescendant", opts[active].id);
    opts[active].scrollIntoView({ block: "nearest" });
  }
  function go(a) { close(); location.assign(a.href); }
  function make() {
    const Ed = E();
    input = Ed.el("input", { type: "search", class: "search-input", role: "combobox", "aria-expanded": "true", "aria-controls": "search-list", "aria-autocomplete": "list", "aria-label": "Search sports, games, teams, players and bets", placeholder: "Team, player, sport or bet", autocomplete: "off", spellcheck: "false" });
    list = Ed.el("div", { class: "search-list", id: "search-list", role: "listbox", "aria-label": "Results" });
    const shut = Ed.el("button", { type: "button", class: "btn btn-secondary btn-sm search-close", text: "Close" });
    dlg = Ed.el("dialog", { class: "search-dialog", "aria-label": "Search" }, [
      Ed.el("div", { class: "search-bar" }, [input, shut]),
      list,
      Ed.el("p", { class: "search-foot", text: "Arrow keys move, Enter opens, Esc closes." })
    ]);
    document.body.appendChild(dlg);
    shut.addEventListener("click", close);
    dlg.addEventListener("click", function (ev) { if (ev.target === dlg) close(); });
    dlg.addEventListener("close", function () { if (opener && opener.focus) opener.focus(); });
    input.addEventListener("input", render);
    input.addEventListener("keydown", function (ev) {
      /* a search field's own Esc would only clear the text: one press closes, as the footer says */
      if (ev.key === "Escape") { ev.preventDefault(); close(); }
      else if (ev.key === "ArrowDown") { ev.preventDefault(); move(1); }
      else if (ev.key === "ArrowUp") { ev.preventDefault(); move(-1); }
      else if (ev.key === "Enter") { const opts = list.querySelectorAll(".search-option"), a = active >= 0 ? opts[active] : opts[0]; if (a) { ev.preventDefault(); go(a); } }
    });
  }
  function open(q) {
    opener = document.activeElement;
    /* rebuilt on every open: a game that started since the last one is marked, not offered */
    index = null;
    if (!dlg) make();
    if (typeof q === "string") input.value = q;
    if (!dlg.open) { if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", ""); }
    input.focus(); input.select();
    render();
    return ensureData().then(function () { if (dlg.open) render(); });
  }
  function close() { if (dlg && dlg.open) { if (typeof dlg.close === "function") dlg.close(); else dlg.removeAttribute("open"); } }

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("[data-search-open]").forEach(function (b) { b.addEventListener("click", function () { open(); }); });
  });
  document.addEventListener("keydown", function (ev) {
    const t = ev.target, typing = t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName || ""));
    const slash = ev.key === "/" && !typing && !ev.metaKey && !ev.ctrlKey && !ev.altKey;
    const cmdK = (ev.metaKey || ev.ctrlKey) && (ev.key === "k" || ev.key === "K");
    if ((slash || cmdK) && !(dlg && dlg.open)) { ev.preventDefault(); open(); }
  });

  window.EdgeLineSearch = { open: open, close: close, search: function (q) { return ensureData().then(function () { return search(q); }); } };
})();
