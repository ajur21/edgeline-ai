/* EdgeLine AI — team identity and faces.
   Resolves the team names the odds feed uses ("Los Angeles Clippers", "LA Dodgers", "Buffalo")
   to ESPN's team records in data/teams.js (window.TEAMS_DATA) and draws logos, matchup
   strips and player faces (data/faces.js, window.FACES_DATA, NBA rotation players with
   injury status). Every image has a text fallback (the abbreviation or initials), so a
   missing file or a blocked CDN never leaves a hole. Exposes window.EdgeLineTeams. */
(function () {
  "use strict";
  const CDN = "https://a.espncdn.com";
  const SPORT_KEYS = { NBA: ["basketball_nba"], NFL: ["americanfootball_nfl"], MLB: ["baseball_mlb"], NHL: ["icehockey_nhl"], NCAAF: ["americanfootball_ncaaf"], Soccer: ["soccer_epl", "soccer_usa_mls", "soccer_spain_la_liga"] };
  const HEADSHOT_PATH = { basketball_nba: "nba", americanfootball_nfl: "nfl", baseball_mlb: "mlb", icehockey_nhl: "nhl" };
  const el = function (tag, attrs, children) { return window.EdgeLine ? window.EdgeLine.el(tag, attrs, children) : document.createElement(tag); };

  function norm(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim(); }
  /* "Los Angeles Lakers" -> "la lakers", "New York Knicks" -> "ny knicks", "St. Louis" -> "st louis" (norm does that) */
  function aliases(t) {
    const out = [t.name, t.short, t.nick, t.location, t.abbr, t.location && t.nick ? t.location + " " + t.nick : null];
    if (t.aka) t.aka.forEach(function (n) { out.push(n); }); /* college football: the odds feed's other spellings (data/teams.js `aka`) */
    const loc = norm(t.location);
    if (/^los angeles/.test(loc)) out.push("la " + norm(t.nick), "l a " + norm(t.nick));
    if (/^new york/.test(loc)) out.push("ny " + norm(t.nick));
    if (/^(golden state)/.test(loc)) out.push("gs " + norm(t.nick));
    if (/^(san francisco)/.test(loc)) out.push("sf " + norm(t.nick));
    if (/^(tampa bay)/.test(loc)) out.push("tb " + norm(t.nick));
    if (/^(new england)/.test(loc)) out.push("ne " + norm(t.nick));
    if (/^(kansas city)/.test(loc)) out.push("kc " + norm(t.nick));
    return out.filter(Boolean).map(norm);
  }
  /* one index per league: alias -> team; an alias two teams share (a city with two clubs) is dropped */
  const index = {};
  function league(key) {
    if (index[key]) return index[key];
    const d = window.TEAMS_DATA, lg = d && d.leagues && d.leagues[key];
    const map = {}, dupes = {}, teams = (lg && lg.teams) || [];
    teams.forEach(function (t) { aliases(t).forEach(function (a) { if (map[a] && map[a] !== t) dupes[a] = true; else map[a] = t; }); });
    Object.keys(dupes).forEach(function (a) { delete map[a]; });
    return (index[key] = { map: map, teams: teams });
  }
  function keysFor(sportOrKey) {
    if (!sportOrKey) return [];
    if (SPORT_KEYS[sportOrKey]) return SPORT_KEYS[sportOrKey];
    const d = window.TEAMS_DATA;
    if (d && d.leagues && d.leagues[sportOrKey]) return [sportOrKey];
    /* an unknown soccer key still searches every soccer league */
    if (/^soccer/.test(sportOrKey)) return SPORT_KEYS.Soccer;
    return [];
  }
  /* the team a feed name refers to, or null */
  function find(sportOrKey, name) {
    const n = norm(name); if (!n) return null;
    const keys = keysFor(sportOrKey);
    for (let i = 0; i < keys.length; i++) {
      const lg = league(keys[i]);
      if (lg.map[n]) return lg.map[n];
    }
    /* "Buffalo" (a location), "Clippers" (a nickname), "Man City" (a prefix): unique partial matches only */
    for (let i = 0; i < keys.length; i++) {
      const lg = league(keys[i]);
      const hits = lg.teams.filter(function (t) { const nick = norm(t.nick), full = norm(t.name); return (nick && (n === nick || n.endsWith(" " + nick))) || full.startsWith(n + " ") || n.startsWith(full + " "); });
      if (hits.length === 1) return hits[0];
    }
    /* a soccer club under another spelling: "Chicago Fire" / "Chicago Fire FC", "Los Angeles FC" / "LAFC" (clubCore) */
    const c = clubCore(name);
    for (let i = 0; i < keys.length; i++) {
      if (!/^soccer/.test(keys[i])) continue;
      const hits = league(keys[i]).teams.filter(function (t) { return clubCore(t.name) === c || clubCore(t.short) === c; });
      if (hits.length === 1) return hits[0];
    }
    return null;
  }
  /* the club suffix dropped and the two MLS clubs ESPN names differently mapped (as scripts/context.js clubCore) */
  const CLUB_ALIAS = { losangeles: "lafc", newyorkredbulls: "redbullnewyork", nyredbulls: "redbullnewyork" };
  function clubCore(s) {
    const c = norm(s).split(" ").filter(function (w) { return w && !/^(fc|sc|cf|afc)$/.test(w); }).join("");
    return CLUB_ALIAS[c] || c;
  }
  /* home and away from the record, or parsed from "Away @ Home" / "Home vs. Away" (soccer) when a leg only carries the event label */
  function sides(p) {
    if (!p) return { home: null, away: null };
    if (p.home || p.away) return { home: p.home || null, away: p.away || null };
    const ev = String(p.event || ""), at = ev.split(/\s@\s/), vs = ev.split(/\svs\.?\s/i);
    if (at.length === 2) return { away: at[0].trim(), home: at[1].trim() };
    if (vs.length === 2) return { home: vs[0].trim(), away: vs[1].trim() };
    return { home: null, away: null };
  }
  function withSides(p) { if (!p || (p.home && p.away)) return p; const s = sides(p); return Object.assign({}, p, { home: p.home || s.home, away: p.away || s.away }); }
  function teamFor(p, which) { return p ? find(p.sportKey || p.sport, p[which]) : null; }
  function initials(name) { return String(name || "").split(/\s+/).filter(Boolean).map(function (w) { return w[0]; }).join("").slice(0, 3).toUpperCase() || "?"; }
  function resized(url, px) { return url && url.indexOf(CDN) === 0 ? CDN + "/combiner/i?img=" + encodeURIComponent(url.slice(CDN.length)) + "&w=" + px * 2 + "&h=" + px * 2 : url; }

  /* an <img> for the team's logo (ESPN's CDN, resized for the slot) that becomes a monogram chip if it fails */
  function logo(team, name, px) {
    px = px || 40;
    const label = team ? (team.abbr || initials(team.short)) : initials(name);
    const mono = el("span", { class: "team-logo team-mono", "data-size": String(px), text: label, title: team ? team.name : name || "" });
    if (!team || !team.logo) return mono;
    const img = el("img", { class: "team-logo", src: resized(team.logo, px), alt: "", width: String(px), height: String(px), loading: "lazy", decoding: "async", title: team.name });
    img.addEventListener("error", function () { img.replaceWith(mono); });
    return img;
  }
  /* which side of the game a pick is on: "home", "away", "total", "draw" or null */
  function side(p) {
    p = withSides(p);
    if (!p) return null;
    const text = p.outcome && p.outcome.name ? p.outcome.name : String(p.pick || "");
    if (/^(over|under)\b/i.test(text)) return "total";
    if (/^draw\b/i.test(text)) return "draw";
    const key = p.sportKey || p.sport, home = find(key, p.home), away = find(key, p.away);
    const picked = find(key, text.replace(/\s+(ML|[-+]\d+(\.\d+)?|[-+]?\d+(\.\d+)?\s*(goals?|runs?|points?))\s*$/i, "").replace(/\s+ML$/i, ""));
    if (picked && home && picked.id === home.id) return "home";
    if (picked && away && picked.id === away.id) return "away";
    if (home && norm(text).startsWith(norm(p.home))) return "home";
    if (away && norm(text).startsWith(norm(p.away))) return "away";
    if (!home && norm(text).startsWith(norm(p.home))) return "home";
    if (!away && norm(text).startsWith(norm(p.away))) return "away";
    return null;
  }
  /* the matchup strip: away logo, "@", home logo; the picked side is lit and ringed in its colour, the other side dimmed */
  function matchup(p, opts) {
    opts = opts || {};
    p = withSides(p);
    if (!p || !(p.home && p.away)) return null;
    const px = opts.size === "lg" ? 72 : opts.size === "sm" ? 24 : 40, s = side(p);
    const soccer = /soccer/.test(p.sportKey || "") || p.sport === "Soccer";
    function team(which) {
      const t = teamFor(p, which), on = s === which || s === "total", node = el("span", { class: "mu-team mu-" + which + (on ? " is-on" : " is-off") + (s === which ? " is-pick" : ""), title: p[which] }, [logo(t, p[which], px), opts.abbr === false ? null : el("span", { class: "mu-abbr", text: t ? (t.abbr || t.short) : initials(p[which]) })]);
      if (t && t.color) node.style.setProperty("--team", t.color);
      return node;
    }
    const wrap = el("div", { class: "matchup matchup-" + (opts.size || "md"), "data-side": s || "none", "aria-label": p.away + (soccer ? " vs " : " at ") + p.home }, [team("away"), el("span", { class: "mu-at", "aria-hidden": "true", text: soccer ? "v" : "@" }), team("home")]);
    return wrap;
  }
  /* tint a card with the picked team's colour (a faint glow in CSS); totals use the home team */
  function tint(node, p) {
    p = withSides(p);
    const s = side(p), t = s === "away" ? teamFor(p, "away") : teamFor(p, "home");
    if (node && t && t.color) { node.style.setProperty("--team", t.color); node.classList.add("has-team"); }
    return node;
  }
  function headshot(sportKey, athleteId, px) {
    const path = HEADSHOT_PATH[sportKey]; if (!path || !athleteId) return null;
    return resized(CDN + "/i/headshots/" + path + "/players/full/" + athleteId + ".png", px || 48);
  }
  /* a player's face: the headshot, or initials when there is none */
  function face(sportKey, player, px) {
    px = px || 48;
    const mono = el("span", { class: "face-img face-mono", text: initials(player.name) });
    const url = player.headshot ? resized(player.headshot, px) : headshot(sportKey, player.id, px);
    if (!url) return mono;
    const img = el("img", { class: "face-img", src: url, alt: "", width: String(px), height: String(px), loading: "lazy", decoding: "async" });
    img.addEventListener("error", function () { img.replaceWith(mono); });
    return img;
  }
  function injuryClass(st) { return /^(out|injured|ir|doubtful|suspended)/i.test(st || "") ? "inj-out" : st ? "inj-q" : ""; }
  /* the names on a game: the injured first, then the top scorers, from data/faces.js (NBA only for now) */
  function facesFor(p, opts) {
    opts = opts || {};
    p = withSides(p);
    const d = window.FACES_DATA, all = (d && d.players) || [];
    if (!p || !all.length) return [];
    /* the file holds one league's players, so a game from another league gets none: until 2026-11-10 an NHL game with the
       Los Angeles Kings was given Sacramento's players, matched on the nickname */
    if ((p.sportKey || (p.sport === "NBA" ? "basketball_nba" : null)) !== (d.league || "basketball_nba")) return [];
    const key = p.sportKey || p.sport, home = teamFor(p, "home"), away = teamFor(p, "away");
    const per = opts.perTeam || 3, out = [];
    [["away", away], ["home", home]].forEach(function (pair) {
      const t = pair[1]; if (!t) return;
      const mine = all.filter(function (pl) { const pt = find(key, pl.team); return pt && pt.id === t.id; });
      /* Out first (the news a bettor needs), then the day-to-day names by scoring */
      const isOut = function (pl) { return /^(out|injured|ir|doubtful|suspended)/i.test(pl.injury || "") ? 0 : 1; };
      const hurt = mine.filter(function (pl) { return pl.injury; }).sort(function (a, b) { return isOut(a) - isOut(b) || (b.pts || 0) - (a.pts || 0); });
      const fit = mine.filter(function (pl) { return !pl.injury; }).sort(function (a, b) { return (b.pts || 0) - (a.pts || 0); });
      hurt.slice(0, 2).concat(fit).slice(0, per).forEach(function (pl) { out.push(Object.assign({ side: pair[0], abbr: t.abbr }, pl)); });
    });
    return out;
  }
  function faces(p, opts) {
    opts = opts || {};
    const list = facesFor(p, opts);
    if (!list.length) return null;
    const key = p.sportKey || (p.sport === "NBA" ? "basketball_nba" : null);
    return el("div", { class: "faces", "aria-label": "Players to know" }, [
      opts.title === false ? null : el("span", { class: "faces-title", text: opts.title || "Names to know" }),
      el("ul", { class: "faces-list" }, list.map(function (pl) {
        return el("li", { class: "face" + (pl.injury ? " face-hurt" : "") }, [
          face(key, pl, opts.px || 48),
          el("span", { class: "face-meta" }, [
            el("span", { class: "face-name", text: pl.name }),
            el("span", { class: "face-sub" }, [el("span", { class: "face-team", text: pl.abbr || "" }), pl.injury ? el("span", { class: "inj-status " + injuryClass(pl.injury), text: pl.injury }) : el("span", { class: "mono face-pts", text: pl.pts != null ? pl.pts.toFixed(1) + " ppg" : "" })])
          ])
        ]);
      }))
    ]);
  }
  /* the picked team's logo on its own; a total, a draw or an unknown side shows the small matchup instead */
  function sideLogo(p, px) {
    p = withSides(p);
    const s = side(p);
    if (s === "home" || s === "away") { const t = teamFor(p, s), node = el("span", { class: "mu-team is-pick mu-solo", title: p[s] }, [logo(t, p[s], px || 28)]); if (t && t.color) node.style.setProperty("--team", t.color); return node; }
    return matchup(p, { size: "sm", abbr: false });
  }
  window.EdgeLineTeams = { sides: sides, sideLogo: sideLogo, find: find, clubCore: clubCore, teamFor: teamFor, logo: logo, side: side, matchup: matchup, tint: tint, headshot: headshot, face: face, faces: faces, facesFor: facesFor, initials: initials, resized: resized };
})();
