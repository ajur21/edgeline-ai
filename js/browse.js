/* ==========================================================================
   EdgeLine AI — browse by sport and by game (owner ask, 2026-11-08, after
   covers.com/picks: "it's not its main thing, but if someone wants a specific
   team or game's picks they should be able to find it easily").
   1. picks.html (#browse): league tabs above the leans list, in a fixed order
      (NFL, College football, NBA, NHL, Soccer, MLB in season, then any other
      sport the data carries). "All" is the ranked list as it was. A sport tab
      shows that sport's leans, likeliest first, then every game of the sport by
      start time. NFL and college football list their whole week and soccer its
      weekend, read from ESPN's public scoreboard (real data only); the board's
      own games stand in when ESPN cannot be read. The tab lives in the address
      (?sport=NFL), so it can be shared and the back button works.
   2. game.html (#game-page): one game. ?id=<eventId> for a game on the board;
      ?espn=<id>&league=<sportKey>&date=<YYYYMMDD> for one outside the pricing
      window. Its lean, every side we priced, why, its player props and, after
      the game, the result. An unknown or expired id gets a way back, never an
      empty page.
   3. Every lean card's event line links to its game page (picks, home).
   All text goes in through EdgeLine.el (textContent). Exposes window.EdgeLineBrowse.
   ========================================================================== */
(function () {
  "use strict";
  const E = window.EdgeLine;
  if (!E) return;
  const el = E.el;
  function TM() { return window.EdgeLineTeams || null; }

  /* ---------- wording: "leans", not picks (owner, 2026-11-05); EdgeLine.word / nWord switch it when present ---------- */
  const WORDS = { lean: "lean", leans: "leans", Lean: "Lean", Leans: "Leans" };
  function W(k) {
    try { const v = typeof E.word === "function" ? E.word(k) : null; if (typeof v === "string" && v) return v; } catch (e) { /* the fallback below */ }
    return WORDS[k] || k;
  }
  function nW(n) {
    try {
      let v = typeof E.nWord === "function" ? E.nWord(n) : null;
      if (typeof v === "string" && v) { if (v.indexOf(String(n)) < 0) v = n + " " + v; return v; }
    } catch (e) { /* the fallback below */ }
    return n + " " + W(n === 1 ? "lean" : "leans");
  }

  /* the lowest confidence tier reads "Low" (owner, 2026-11-08); the data still says "Lean". EdgeLine.tierLabel / tierText
     on main do it; these fall back the same way until the branches meet */
  function tierLabel(c) {
    try { if (typeof E.tierLabel === "function") return E.tierLabel(c); } catch (e) { /* the fallback below */ }
    return c === "Lean" ? "Low" : c;
  }
  function tierText(s) {
    try { if (typeof E.tierText === "function") return E.tierText(s); } catch (e) { /* the fallback below */ }
    return String(s == null ? "" : s).replace(/\bLean\b/g, "Low");
  }

  /* ---------- sports: the fixed tab order (owner, 2026-11-08: NFL is never buried), labels, ESPN leagues ---------- */
  const ORDER = ["NFL", "NCAAF", "NBA", "NHL", "Soccer", "MLB"];
  const LABEL = { NCAAF: "College football" };
  function label(s) { return LABEL[s] || s; }
  /* mid-sentence: "No college football leans", "No NFL leans" */
  function lab(s) { return LABEL[s] ? LABEL[s].charAt(0).toLowerCase() + LABEL[s].slice(1) : s; }
  const SPORT_OF_KEY = { americanfootball_nfl: "NFL", americanfootball_ncaaf: "NCAAF", basketball_nba: "NBA", icehockey_nhl: "NHL", baseball_mlb: "MLB" };
  function sportOf(x) {
    if (!x) return "";
    if (x.sport) return String(x.sport);
    const k = String(x.sportKey || "");
    return SPORT_OF_KEY[k] || (/^soccer/.test(k) ? "Soccer" : "");
  }
  /* week: the league's own week from its default scoreboard (NFL Thursday to Monday, college football Tuesday to Saturday) */
  const LEAGUES = {
    NFL: [{ sport: "NFL", path: "football/nfl", key: "americanfootball_nfl", week: true }],
    NCAAF: [{ sport: "NCAAF", path: "football/college-football", key: "americanfootball_ncaaf", week: true, query: "groups=80&limit=400" }],
    NBA: [{ sport: "NBA", path: "basketball/nba", key: "basketball_nba" }],
    NHL: [{ sport: "NHL", path: "hockey/nhl", key: "icehockey_nhl" }],
    MLB: [{ sport: "MLB", path: "baseball/mlb", key: "baseball_mlb" }],
    Soccer: [{ sport: "Soccer", path: "soccer/eng.1", key: "soccer_epl", league: "Premier League" }, { sport: "Soccer", path: "soccer/usa.1", key: "soccer_usa_mls", league: "MLS" }]
  };
  const EXTRA_LEAGUES = { soccer_spain_la_liga: { sport: "Soccer", path: "soccer/esp.1", key: "soccer_spain_la_liga", league: "La Liga" } };
  function leagueOfKey(key) {
    const all = [].concat.apply([], Object.keys(LEAGUES).map(function (s) { return LEAGUES[s]; }));
    return all.find(function (lg) { return lg.key === key; }) || EXTRA_LEAGUES[key] || null;
  }
  const UNITS = { NBA: "points", NFL: "points", NCAAF: "points", NHL: "goals", Soccer: "goals", MLB: "runs" };
  const PROPS_SPORTS = { NBA: true, NFL: true, NCAAF: true };
  /* MLB has a tab only in season (late March to the World Series) or when the board carries it */
  function mlbSeason() { const m = Number(todayKey().slice(5, 7)); return m >= 3 && m <= 10; }

  /* ---------- Eastern dates and times (the site's one clock: EdgeLine.now) ---------- */
  const ET = "America/New_York";
  const fmtKey = new Intl.DateTimeFormat("en-CA", { timeZone: ET, year: "numeric", month: "2-digit", day: "2-digit" });
  const fmtTime = new Intl.DateTimeFormat("en-US", { timeZone: ET, hour: "numeric", minute: "2-digit" });
  const fmtHour = new Intl.DateTimeFormat("en-US", { timeZone: ET, hour: "numeric", hourCycle: "h23" });
  function keyOf(ms) { return Number.isFinite(ms) ? fmtKey.format(new Date(ms)) : ""; }
  function todayKey() { return keyOf(E.now()); }
  function keyDate(k) { const p = String(k).split("-").map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2], 12)); }
  function shiftKey(k, d) { const x = keyDate(k); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); }
  function dow(k) { return keyDate(k).getUTCDay(); }
  /* "Thu Nov 5" */
  function shortDay(k) { return keyDate(k).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).replace(",", ""); }
  function timeET(ms) { return fmtTime.format(new Date(ms)) + " ET"; }
  function startOf(g) { const t = Date.parse((g && g.commence) || ""); return Number.isFinite(t) ? t : E.startMs(g); }
  /* "Today 7:10 PM ET", "Tomorrow 8:15 PM ET", "Thu Nov 12, 8:15 PM ET": the site's one start label (EdgeLine.startLabel),
     with the date on a day past tomorrow because a game page can be a week out */
  function whenLong(ms) { return Number.isFinite(ms) ? E.startLabel({ commence: new Date(ms).toISOString() }, { date: true }) : ""; }
  /* "Starts in 2 hr 50 min", "Starts in 3 days" */
  function untilText(ms) {
    const m = Math.round((ms - E.now()) / 60e3);
    if (m <= 1) return "Starts any minute";
    if (m < 60) return "Starts in " + m + " min";
    const h = Math.floor(m / 60), r = m % 60;
    if (h < 24) return "Starts in " + h + " hr" + (r ? " " + r + " min" : "");
    const d = Math.round(h / 24);
    return "Starts in " + d + (d === 1 ? " day" : " days");
  }
  /* "today 7:00 PM", "tomorrow 1:00 PM", "Thu 8:15 PM": the next game on a tab */
  function nextText(ms) {
    const k = keyOf(ms), t = todayKey(), time = fmtTime.format(new Date(ms));
    if (k === t) return "today " + time;
    if (k === shiftKey(t, 1)) return "tomorrow " + time;
    return keyDate(k).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short" }) + " " + time;
  }

  /* ---------- the pricing runs (scripts/update-data.js): full runs at 14:00 and 20:30 UTC; the NBA, NFL and soccer on the
     afternoon run (the NFL's early-kickoff mornings only refresh games an afternoon run already priced), college football
     on Friday's afternoon run only (`runDays`: Friday night and Saturday); each asks for the games starting inside 36 hours.
     A game no scheduled run reaches before its kickoff (a midweek college game) has no first run: "Not priced yet" ---------- */
  /* the slot rule itself (which runs price which sport) lives in js/app.js since 2026-11-10, where a held game's "decided at
     the next run" reads it too: EdgeLine.runAfter(sport, from, strict), EdgeLine.nextRunFor(sport) */
  const WINDOW_MS = 36 * 36e5, runAfter = E.runAfter;
  /* the first run whose window reaches the kickoff (NaN when none does before it) */
  function firstRun(sport, kick) { if (!Number.isFinite(kick)) return NaN; const t = runAfter(sport, kick - WINDOW_MS, false); return t < kick ? t : NaN; }
  const nextRunFor = E.nextRunFor;
  /* "Saturday afternoon", "tomorrow morning", "this afternoon" */
  function runWord(t) {
    const k = keyOf(t), today = todayKey(), part = Number(fmtHour.format(new Date(t))) < 12 ? "morning" : "afternoon";
    if (k === today) return "this " + part;
    if (k === shiftKey(today, 1)) return "tomorrow " + part;
    return keyDate(k).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long" }) + " " + part;
  }

  /* ---------- ESPN's public scoreboard (no key, CORS open: see js/live.js), read only for real data ---------- */
  const ESPN = "https://site.api.espn.com/apis/site/v2/sports/";
  const memo = {};
  function getJSON(url, fresh) {
    if (!fresh && memo[url]) return memo[url];
    const p = fetch(url, { headers: { accept: "application/json" } }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    if (!fresh) memo[url] = p;
    return p;
  }
  function realData() { const d = window.PICKS_DATA; return !!d && d.sample === false; }
  function sbURL(lg, extra) { const q = [lg.query, extra].filter(Boolean).join("&"); return ESPN + lg.path + "/scoreboard" + (q ? "?" + q : ""); }
  function espnTeam(x) {
    const t = (x && x.team) || {}, rank = x && x.curatedRank ? Number(x.curatedRank.current) : NaN;
    return { id: t.id != null ? String(t.id) : "", name: t.displayName || t.name || "", short: t.shortDisplayName || t.location || "", abbr: t.abbreviation || "", location: t.location || "", nick: t.name || "", logo: t.logo || null, color: t.color ? "#" + String(t.color).replace(/[^0-9a-f]/gi, "") : null, score: x && x.score != null && x.score !== "" ? Number(x.score) : NaN, rank: rank >= 1 && rank <= 25 ? rank : null };
  }
  function eventsOf(d, lg) {
    return ((d && d.events) || []).map(function (e) {
      const c = e && e.competitions && e.competitions[0]; if (!c || !Array.isArray(c.competitors)) return null;
      const h = c.competitors.find(function (x) { return x.homeAway === "home"; }), a = c.competitors.find(function (x) { return x.homeAway === "away"; });
      const ms = Date.parse(e.date || c.date || "");
      if (!h || !a || !Number.isFinite(ms)) return null;
      const st = c.status || e.status || {}, type = st.type || {};
      const tv = (c.broadcasts || []).map(function (b) { return (b.names || []).join(", "); }).filter(Boolean)[0] || null;
      return { espnId: String(e.id), sport: lg.sport, sportKey: lg.key, league: lg.league || null, path: lg.path, ms: ms, timeValid: c.timeValid !== false, home: espnTeam(h), away: espnTeam(a), state: type.state || "pre", detail: type.shortDetail || type.detail || "", venue: c.venue && c.venue.fullName ? c.venue.fullName : null, tv: tv };
    }).filter(Boolean);
  }
  /* the week after this one, from the league's calendar ({ week, type }), when every game of this one is over */
  function nextWeek(d) {
    const lg = d.leagues && d.leagues[0], cal = lg && Array.isArray(lg.calendar) ? lg.calendar : [];
    const type = String((d.season && d.season.type) || ""), wk = String((d.week && d.week.number) || "");
    for (let i = 0; i < cal.length; i++) {
      const sec = cal[i]; if (!sec || String(sec.value) !== type || !Array.isArray(sec.entries)) continue;
      const j = sec.entries.findIndex(function (x) { return String(x.value) === wk; });
      if (j < 0) continue;
      if (sec.entries[j + 1]) return { week: sec.entries[j + 1].value, type: sec.value };
      const nx = cal[i + 1]; if (nx && Array.isArray(nx.entries) && nx.entries[0]) return { week: nx.entries[0].value, type: nx.value };
    }
    return null;
  }
  function weekSchedule(lg) {
    return getJSON(sbURL(lg)).then(function (d) {
      if (!d) return null;
      const evs = eventsOf(d, lg), now = E.now();
      const cur = { events: evs, week: d.week && d.week.number != null ? d.week.number : null };
      const over = evs.length > 0 && evs.every(function (x) { return x.state === "post" || x.ms + 5 * 36e5 < now; });
      const nx = over ? nextWeek(d) : null;
      if (!nx) return cur;
      return getJSON(sbURL(lg, "week=" + encodeURIComponent(nx.week) + "&seasontype=" + encodeURIComponent(nx.type))).then(function (d2) {
        const e2 = d2 ? eventsOf(d2, lg) : [];
        return e2.length ? { events: e2, week: d2.week && d2.week.number != null ? d2.week.number : nx.week } : cur;
      });
    });
  }
  /* soccer's weekend: Friday to Monday from Friday on; from midweek, today to Monday */
  function soccerWindow() {
    const t = todayKey(), w = dow(t);
    if (w === 5 || w === 6 || w === 0 || w === 1) { const from = shiftKey(t, -({ 5: 0, 6: 1, 0: 2, 1: 3 })[w]); return { from: from, to: shiftKey(from, 3) }; }
    return { from: t, to: shiftKey(t, (8 - w) % 7) };
  }
  function calDays(d) {
    const lg = d.leagues && d.leagues[0], cal = lg && Array.isArray(lg.calendar) ? lg.calendar : [];
    return cal.map(function (c) { return typeof c === "string" ? c.slice(0, 10) : c && c.startDate ? String(c.startDate).slice(0, 10) : null; }).filter(Boolean);
  }
  function soccerSchedule() {
    const win = soccerWindow();
    return Promise.all(LEAGUES.Soccer.map(function (lg) {
      return getJSON(sbURL(lg)).then(function (d) {
        if (!d) return null;
        const have = d.day && d.day.date ? String(d.day.date).slice(0, 10) : null;
        const days = calDays(d).filter(function (k, i, a) { return k >= win.from && k <= win.to && k !== have && a.indexOf(k) === i; });
        return Promise.all(days.map(function (k) { return getJSON(sbURL(lg, "dates=" + k.replace(/-/g, ""))); })).then(function (more) {
          return more.filter(Boolean).reduce(function (acc, x) { return acc.concat(eventsOf(x, lg)); }, eventsOf(d, lg));
        });
      });
    })).then(function (lists) {
      if (lists.every(function (x) { return x == null; })) return null;
      const seen = {}, out = [];
      lists.forEach(function (l) { (l || []).forEach(function (ev) { const k = keyOf(ev.ms); if (seen[ev.espnId] || k < win.from || k > win.to) return; seen[ev.espnId] = true; out.push(ev); }); });
      return { events: out, from: win.from, to: win.to };
    });
  }
  function dailySchedule(sport, days) {
    const jobs = [];
    (LEAGUES[sport] || []).forEach(function (lg) { days.forEach(function (k) { jobs.push(getJSON(sbURL(lg, "dates=" + k.replace(/-/g, ""))).then(function (d) { return d ? eventsOf(d, lg) : null; })); }); });
    return Promise.all(jobs).then(function (lists) {
      if (!lists.length || lists.every(function (x) { return x == null; })) return null;
      const seen = {}, out = [];
      lists.forEach(function (l) { (l || []).forEach(function (ev) { if (!seen[ev.espnId]) { seen[ev.espnId] = true; out.push(ev); } }); });
      return { events: out, days: days };
    });
  }
  /* the schedule a sport tab lists: the week (NFL, college football), the weekend (soccer) or the board's days (the rest) */
  function scheduleFor(sport) {
    if (!realData() || !LEAGUES[sport]) return Promise.resolve(null);
    if (sport === "Soccer") return soccerSchedule();
    if (LEAGUES[sport][0].week) return weekSchedule(LEAGUES[sport][0]);
    const today = todayKey(), onBoard = boardGames().filter(function (g) { return g.sport === sport; }).map(function (g) { return keyOf(startOf(g)); }).filter(Boolean);
    const days = (onBoard.length ? [today].concat(onBoard) : [today, shiftKey(today, 1), shiftKey(today, 2)]).filter(function (k, i, a) { return a.indexOf(k) === i; }).sort().slice(0, 3);
    return dailySchedule(sport, days);
  }

  /* ---------- the games on the board: every market row grouped by event, plus the leans whose games left the market file ---------- */
  function norm(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim(); }
  function game(o) { return Object.assign({ id: null, espnId: null, rows: [], picks: [], aliases: [], espn: null, tbd: false }, o); }
  /* a lean's id starts with the first ten characters of its event id (scripts/update-data.js) */
  function idPrefix(p) { const m = /^([0-9a-f]{10})-/.exec(String((p && p.id) || "")); return m ? m[1] : null; }
  let boardCache = null;
  function boardGames() {
    if (boardCache) return boardCache;
    const M = E.marketData(), D = window.PICKS_DATA || {}, picks = (D.picks || []).filter(function (p) { return p && p.id; });
    const games = [], byId = {};
    (M.rows || []).forEach(function (r) {
      if (r.eventId == null) return;
      const id = String(r.eventId);
      let g = byId[id];
      if (!g) { g = byId[id] = game({ id: id, sport: sportOf(r), sportKey: r.sportKey, league: r.league, event: r.event, home: r.home, away: r.away, commence: r.commence, start: r.start }); g.aliases.push(id, id.slice(0, 10)); games.push(g); }
      g.rows.push(r);
    });
    picks.forEach(function (p) {
      const pre = idPrefix(p);
      let g = games.find(function (x) { return x.rows.some(function (r) { return r.pickId === p.id && r.event === p.event; }); }) ||
        games.find(function (x) { return x.event === p.event && E.dayKey(x) === E.dayKey(p); }) ||
        (pre ? games.find(function (x) { return x.aliases.indexOf(pre) >= 0; }) : null);
      if (!g) { const id = pre || p.id; g = game({ id: id, sport: sportOf(p), sportKey: p.sportKey, league: p.league, event: p.event, home: p.home, away: p.away, commence: p.commence, start: p.start }); g.aliases.push(id); games.push(g); }
      if (g.picks.indexOf(p) < 0) g.picks.push(p);
      if (g.aliases.indexOf(p.id) < 0) g.aliases.push(p.id);
    });
    games.forEach(function (g) { g.picks.sort(E.worthFirst); });
    return (boardCache = games);
  }
  function soccerish(g) { return g.sport === "Soccer" || /^soccer/.test(g.sportKey || ""); }
  /* where a game stands: a graded lean or ESPN's final makes it final; ESPN in progress, or a lean the pipeline calls started, makes it live */
  function stateOf(g) {
    if (g.picks.some(function (p) { return E.gameState(p) === "final"; })) return "final";
    const ev = g.espn;
    if (ev && ev.state === "post") return "final";
    if (ev && ev.state === "in") return "live";
    let s = E.gameState(g);
    if ((s === "upcoming" || s === "soon") && g.picks.some(function (p) { return !E.isOpen(p); })) s = "live";
    return s === "final" ? "awaiting" : s;
  }
  function scoreOf(g) {
    const ev = g.espn;
    if (ev && (ev.state === "in" || ev.state === "post") && Number.isFinite(ev.home.score) && Number.isFinite(ev.away.score)) return { home: ev.home.score, away: ev.away.score, live: ev.state === "in", detail: ev.detail };
    const p = g.picks.find(function (x) { return x.score && x.score.home != null && x.score.away != null; });
    return p ? { home: Number(p.score.home), away: Number(p.score.away), live: false, detail: "Final" } : null;
  }
  /* the club record from data/teams.js (college football's 265 clubs since 2026-11-08), else one made from ESPN's own team */
  function teamFor(g, which) {
    const tm = TM(), name = g[which];
    const t = tm && name ? tm.find(g.sportKey || g.sport, name) : null;
    if (t) return t;
    const e = g.espn && g.espn[which];
    return e ? { id: e.id, abbr: e.abbr, name: e.name, short: e.short, location: e.location, nick: e.nick, logo: e.logo, color: e.color } : null;
  }
  function teamName(g, which, t) { t = t || teamFor(g, which); return g.sport === "NCAAF" ? (t && (t.short || t.location)) || g[which] || "" : (t && t.name) || g[which] || ""; }
  function teamAbbr(g, which, t) { t = t || teamFor(g, which); return (t && t.abbr) || (TM() ? TM().initials(g[which]) : String(g[which] || "").slice(0, 3).toUpperCase()); }
  function rankOf(g, which) { const e = g.espn && g.espn[which]; return e && e.rank ? e.rank : null; }
  /* "FLA @ BOS", "MUN v AVL" */
  function shortEvent(g) { return soccerish(g) ? teamAbbr(g, "home") + " v " + teamAbbr(g, "away") : teamAbbr(g, "away") + " @ " + teamAbbr(g, "home"); }
  function longEvent(g) { return soccerish(g) ? teamName(g, "home") + " v " + teamName(g, "away") : teamName(g, "away") + " @ " + teamName(g, "home"); }
  function order(g) { return soccerish(g) ? ["home", "away"] : ["away", "home"]; }
  /* is this odds-feed name ESPN's team? data/teams.js carries ESPN's ids; otherwise by name */
  function teamIs(name, et, key) {
    if (!name || !et) return false;
    const tm = TM(), t = tm ? tm.find(key, name) : null;
    if (t && et.id && String(t.id) === String(et.id)) return true;
    const n = norm(name);
    if (!n) return false;
    if ([et.name, et.short, et.abbr, (et.location || "") + " " + (et.nick || "")].some(function (x) { return x && norm(x) === n; })) return true;
    return !!(tm && tm.clubCore && /^soccer/.test(key || "") && tm.clubCore(name) === tm.clubCore(et.name));
  }
  function sameGame(g, ev) {
    const a = startOf(g);
    if (Number.isFinite(a) && Math.abs(a - ev.ms) > 12 * 36e5) return false;
    const key = g.sportKey || ev.sportKey;
    return (teamIs(g.home, ev.home, key) && teamIs(g.away, ev.away, key)) || (teamIs(g.home, ev.away, key) && teamIs(g.away, ev.home, key));
  }
  function fromEspn(ev) {
    const soccer = /^soccer/.test(ev.sportKey || "");
    return game({ espnId: ev.espnId, sport: ev.sport, sportKey: ev.sportKey, league: ev.league, event: soccer ? ev.home.name + " vs. " + ev.away.name : ev.away.name + " @ " + ev.home.name, home: ev.home.name, away: ev.away.name, commence: new Date(ev.ms).toISOString(), espn: ev, tbd: !ev.timeValid });
  }
  /* the first Eastern day a sport's list shows: today, or the first day of the week (NFL, college football) or weekend
     (soccer) ESPN's schedule covers, so Thursday's final stays in the NFL week while yesterday's NHL games leave the list */
  function fromDay(sched) {
    const t = todayKey(), days = ((sched && sched.events) || []).map(function (ev) { return keyOf(ev.ms); }).concat(sched && sched.from ? [sched.from] : []).filter(Boolean).sort();
    return days.length && days[0] < t ? days[0] : t;
  }
  function onOrAfter(g, k) { const d = keyOf(startOf(g)) || E.dayKey(g); return !d || d >= k; }
  /* one sport's games: the board's, joined to ESPN's schedule when it was read, plus the schedule's games we have not priced */
  function gamesFor(sport, sched) {
    const from = fromDay(sched), board = boardGames().filter(function (g) { return g.sport === sport; }), out = board.filter(function (g) { return onOrAfter(g, from); });
    ((sched && sched.events) || []).forEach(function (ev) {
      const g = board.find(function (b) { return sameGame(b, ev); });
      if (g) { g.espn = ev; if (out.indexOf(g) < 0) out.push(g); } else out.push(fromEspn(ev));
    });
    out.forEach(function (g) { g.state = stateOf(g); });
    return out.sort(timeCmp);
  }
  /* Eastern day, then start time; a game whose time ESPN has not set goes last in its day */
  function timeCmp(a, b) {
    const ka = keyOf(startOf(a)) || "~", kb = keyOf(startOf(b)) || "~";
    if (ka !== kb) return ka < kb ? -1 : 1;
    return ((a.tbd ? 1 : 0) - (b.tbd ? 1 : 0)) || ((startOf(a) || 0) - (startOf(b) || 0)) || String(a.event).localeCompare(String(b.event));
  }
  function hrefFor(g) {
    if (g.id) return "game.html?id=" + encodeURIComponent(g.id);
    if (g.espnId) return "game.html?espn=" + encodeURIComponent(g.espnId) + "&league=" + encodeURIComponent(g.sportKey || "") + "&date=" + keyOf(startOf(g)).replace(/-/g, "");
    return null;
  }
  function gameOfPick(id) { return boardGames().find(function (g) { return g.picks.some(function (p) { return p.id === id; }); }) || null; }
  /* "Priced from Saturday afternoon" for a game the board does not carry yet */
  function priceNote(g) {
    if (g.state !== "upcoming" && g.state !== "soon") return "Not on our board";
    const t = firstRun(g.sport, startOf(g));
    return Number.isFinite(t) && t > E.now() ? "Priced from " + runWord(t) : "Not priced yet";
  }
  function pastNum(x) { const p = E.pastOf(x); return Number.isFinite(p) ? p : -9; }

  /* ---------- lean cards link to their game page ---------- */
  function linkCards(scope) {
    (scope || document).querySelectorAll(".card.pick[data-id]").forEach(function (card) {
      const ev = card.querySelector(".pick-front .pick-event");
      if (!ev || ev.querySelector("a")) return;
      let g = gameOfPick(card.getAttribute("data-id"));
      if (!g && card.classList.contains("market-card")) g = boardGames().find(function (x) { return x.event === ev.textContent && x.rows.length; }) || null;
      const href = g ? hrefFor(g) : null;
      if (!href) return;
      const text = ev.textContent;
      ev.textContent = "";
      ev.appendChild(el("a", { class: "pick-game-link", href: href, title: "Open the game page: every side we priced and why", text: text }));
    });
  }

  /* ---------- one game as a row in a sport's list ---------- */
  function stateBadge(st) {
    if (st === "live") return el("span", { class: "badge badge-state badge-live", text: "Live" });
    if (st === "final") return el("span", { class: "badge badge-state badge-final", text: "Final" });
    if (st === "awaiting") return el("span", { class: "badge badge-state badge-awaiting", text: "Awaiting result" });
    if (st === "soon") return el("span", { class: "badge badge-state badge-soon", text: "Starts soon" });
    return null;
  }
  function gameRow(g, grouped) {
    const st = g.state, t = startOf(g), lean = g.picks[0] || null, sc = scoreOf(g), href = hrefFor(g), open = st === "upcoming" || st === "soon";
    const sides = order(g);
    const when = el("span", { class: "bg-when" }, [
      stateBadge(st),
      open && !grouped ? el("span", { class: "bg-time", text: g.tbd ? "Time to be set" : Number.isFinite(t) ? timeET(t) : g.start || "" }) : null,
      sc ? el("span", { class: "bg-score mono", text: sc[sides[0]] + "–" + sc[sides[1]] }) : null
    ]);
    function side(which) {
      const tm = teamFor(g, which), r = rankOf(g, which);
      return el("span", { class: "bg-team" }, [TM() ? TM().logo(tm, g[which], 24) : null, r ? el("span", { class: "bg-rank", text: "#" + r }) : null, el("span", { class: "bg-name", text: teamName(g, which, tm) }), el("span", { class: "bg-abbr", text: teamAbbr(g, which, tm) })]);
    }
    const teams = el("span", { class: "bg-teams" }, [side(sides[0]), el("span", { class: "bg-at", "aria-hidden": "true", text: soccerish(g) ? "v" : "@" }), side(sides[1])]);
    const status = el("span", { class: "bg-status" }, lean
      ? [el("span", { class: "badge badge-status badge-pick", text: g.picks.length === 1 ? "1 " + W("lean") : g.picks.length + " " + W("leans") }), el("span", { class: "bg-pick", text: lean.pick }),
         E.gameState(lean) === "final" ? E.stateChip(lean) : !E.isOpen(lean) ? E.liveSlot(lean.id) : null]
      : [el("span", { class: "bg-none", text: g.id ? "No " + W("lean") : priceNote(g) })]);
    return el(href ? "a" : "div", { class: "browse-game" + (lean ? " has-lean" : ""), href: href, "data-state": st, "data-game": g.id || "espn-" + g.espnId }, [when, teams, status]);
  }
  function countText(n) { return n + (n === 1 ? " game" : " games"); }
  /* a sport's games: one block per Eastern day; a day with many games (a college Saturday) is grouped by start time */
  function gamesList(games) {
    const box = el("div", { class: "browse-days" }), byDay = {}, keys = [];
    games.forEach(function (g) { const k = keyOf(startOf(g)) || E.dayKey(g) || ""; if (!byDay[k]) { byDay[k] = []; keys.push(k); } byDay[k].push(g); });
    keys.sort(function (a, b) { return (a || "~") < (b || "~") ? -1 : (a || "~") > (b || "~") ? 1 : 0; });
    keys.forEach(function (k) {
      const list = byDay[k].sort(timeCmp), head = E.dayDivider(k), rows = el("div", { class: "card browse-rows" });
      head.classList.add("browse-day-head");
      head.appendChild(el("span", { class: "browse-count", text: countText(list.length) }));
      if (list.length > 8) {
        const slots = [], bySlot = {};
        list.forEach(function (g) { const s = g.tbd ? "Time to be set" : Number.isFinite(startOf(g)) ? timeET(startOf(g)) : g.start || ""; if (!bySlot[s]) { bySlot[s] = []; slots.push(s); } bySlot[s].push(g); });
        slots.forEach(function (s) {
          rows.appendChild(el("p", { class: "browse-time" }, [el("span", { text: s }), el("span", { class: "browse-count", text: countText(bySlot[s].length) })]));
          bySlot[s].forEach(function (g) { rows.appendChild(gameRow(g, true)); });
        });
      } else list.forEach(function (g) { rows.appendChild(gameRow(g, false)); });
      box.appendChild(el("div", { class: "browse-day" }, [head, rows]));
    });
    return box;
  }
  function gamesBlock(s, games, st) {
    const box = el("section", { class: "browse-games", "aria-labelledby": "browse-games-title" });
    const data = st && st.data, weekly = !!(LEAGUES[s] && LEAGUES[s][0].week);
    const keys = games.map(function (g) { return keyOf(startOf(g)); }).filter(Boolean).sort();
    let span = null;
    if (data && weekly && keys.length) span = (data.week != null ? "Week " + data.week : "This week") + ": " + shortDay(keys[0]) + (keys[keys.length - 1] !== keys[0] ? " to " + shortDay(keys[keys.length - 1]) : "") + ".";
    else if (data && s === "Soccer") span = "Premier League and MLS, " + (data.from === todayKey() ? "today" : shortDay(data.from)) + " to " + shortDay(data.to) + ".";
    box.appendChild(el("h3", { class: "browse-games-title", id: "browse-games-title", text: "Every " + lab(s) + " game" }));
    const priced = games.filter(function (g) { return g.id; }).length;
    box.appendChild(el("p", { class: "muted how-to browse-how" }, [
      span ? el("strong", { class: "browse-span", text: span + " " }) : null,
      "A schedule, so it runs in start-time order, day by day in Eastern time; the " + lab(s) + " " + W("leans") + " above stay likeliest first." +
      (games.length && priced < games.length ? " " + countText(games.length) + (priced ? ", " + priced + " on our board; the rest say when we price them." : "; none is on our board yet, and each says when we price it.") : "")
    ]));
    if (st && st.status === "loading") box.appendChild(el("p", { class: "browse-note", role: "status", text: "Reading the " + lab(s) + " schedule from ESPN…" }));
    else if (st && st.failed) box.appendChild(el("p", { class: "browse-note", text: "ESPN’s schedule could not be read just now, so this lists the games on our board." }));
    if (!games.length) { box.appendChild(el("div", { class: "card empty", text: st && st.status === "loading" ? "Loading the schedule…" : "No " + lab(s) + " games on our board or on this week’s schedule." })); return box; }
    box.appendChild(gamesList(games));
    return box;
  }

  /* ---------- picks.html: league tabs and a sport's panel ---------- */
  function initPicks(mount) {
    const D = window.PICKS_DATA || { picks: [] };
    const filters = document.querySelector('.filter-row[aria-label="Filters"]'), summary = document.getElementById("summary"), host = document.getElementById("picks-host");
    const head = document.getElementById("all-picks"), how = document.querySelector(".picks-head .how-to");
    const tabs = el("nav", { class: "browse-tabs", "aria-label": "Leans by sport" }), panel = el("div", { class: "browse-panel", id: "browse-panel", hidden: "" });
    mount.appendChild(tabs); mount.appendChild(panel);
    const sched = {};
    let saved = null, current = "";
    function known() {
      const out = ORDER.slice();
      boardGames().forEach(function (g) { if (g.sport && out.indexOf(g.sport) < 0) out.push(g.sport); });
      return out;
    }
    function sportParam() {
      const v = String(new URLSearchParams(location.search).get("sport") || "").trim().toLowerCase();
      if (!v) return "";
      if (v === "college football" || v === "cfb" || v === "college-football") return "NCAAF";
      return known().find(function (s) { return s.toLowerCase() === v || label(s).toLowerCase() === v; }) || "";
    }
    function ensure(s) {
      if (sched[s]) return;
      if (!realData() || !LEAGUES[s]) { sched[s] = { status: "done", data: null }; return; }
      sched[s] = { status: "loading", data: null };
      scheduleFor(s).then(function (d) { sched[s] = { status: "done", data: d, failed: !d }; renderTabs(); if (current === s) renderPanel(); });
    }
    function nextGame(s) {
      const d = sched[s] && sched[s].data, now = E.now();
      const t = ((d && d.events) || []).filter(function (ev) { return ev.state === "pre" && ev.timeValid && ev.ms > now; }).map(function (ev) { return ev.ms; }).sort(function (a, b) { return a - b; })[0];
      return Number.isFinite(t) ? t : null;
    }
    /* a tab counts the games on the board from today on (yesterday's finals stay under In progress and results) */
    function today(g) { return onOrAfter(g, todayKey()); }
    function sportsShown() {
      const on = {};
      boardGames().filter(today).forEach(function (g) { on[g.sport] = (on[g.sport] || 0) + 1; });
      return known().map(function (s) { return { sport: s, n: on[s] || 0, next: on[s] ? null : nextGame(s) }; }).filter(function (t) { return t.n || t.next || t.sport === current; });
    }
    function hrefSport(s) { return "picks.html" + (s ? "?sport=" + encodeURIComponent(s) : ""); }
    function renderTabs() {
      tabs.textContent = "";
      const seg = el("div", { class: "seg browse-seg" });
      [{ sport: "", n: boardGames().filter(today).length, next: null }].concat(sportsShown()).forEach(function (t) {
        const text = t.sport ? label(t.sport) : "All", on = t.sport === current;
        const what = t.n ? countText(t.n) + " on the board" : t.next ? "next game " + nextText(t.next) : "no games on the board";
        const a = el("a", { href: hrefSport(t.sport), "data-sport": t.sport, "aria-current": on ? "true" : null, title: text + ": " + what }, [
          el("span", { class: "browse-tab-name", text: text }),
          t.n ? el("span", { class: "seg-count", "aria-label": countText(t.n), text: String(t.n) }) : t.next ? el("span", { class: "browse-next", text: "next game " + nextText(t.next) }) : null
        ]);
        a.addEventListener("click", function (ev) { if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button) return; ev.preventDefault(); go(t.sport, true); });
        seg.appendChild(a);
      });
      tabs.appendChild(seg);
      /* on a phone the row scrolls: keep the chosen tab in view */
      const on = seg.querySelector('[aria-current="true"]');
      if (on && tabs.scrollWidth > tabs.clientWidth) tabs.scrollLeft = Math.max(0, on.offsetLeft - 16);
    }
    function howText(s) {
      return "Every " + lab(s) + " " + W("lean") + " still to start, in the order of the full list: today’s games first, then our probability from the game data, so #1 is the " + lab(s) + " side the model expects to hit most often. Below them, every " + lab(s) + " game on the schedule, by start time, each linked to its game page.";
    }
    function relabel(s) {
      if (!head) return;
      if (s) {
        if (!saved) saved = { head: head.textContent, how: how ? how.textContent : "" };
        head.textContent = label(s) + " " + W("leans") + ", likeliest first";
        if (how) how.textContent = howText(s);
      } else if (saved) { head.textContent = saved.head; if (how) how.textContent = saved.how; saved = null; }
    }
    function lead(s, open, started, games, st) {
      const L = W("leans");
      if (open.length) return [el("strong", { text: nW(open.length) }), " still to start, likeliest first."];
      if (started.length) return [el("strong", { text: "No " + lab(s) + " " + L + " left to bet. " }), (started.length === 1 ? "The one posted has started; where it stands" : "The " + started.length + " posted have started; where they stand") + " is in the games below."];
      if (games.some(function (g) { return g.id && today(g); })) return [el("strong", { text: "No " + lab(s) + " " + L + " today:" }), " no side cleared its bar."];
      if (games.length) {
        const now = E.now(), t = games.filter(function (g) { return g.state === "upcoming" || g.state === "soon"; }).map(function (g) { return firstRun(s, startOf(g)); }).filter(function (x) { return Number.isFinite(x) && x > now; }).sort(function (a, b) { return a - b; })[0];
        return [el("strong", { text: "No " + lab(s) + " " + L + " yet:" }), t && t > E.now() ? " we price these games from " + runWord(t) + ", and post a " + W("lean") + " only where a side clears its bar." : " none of these games is on our board yet."];
      }
      if (st && st.status === "loading") return [el("strong", { text: "No " + lab(s) + " games on our board." }), " Reading the schedule from ESPN…"];
      return [el("strong", { text: "No " + lab(s) + " games on our board or on this week’s schedule." })];
    }
    function renderPanel() {
      const s = current, on = !!s;
      [filters, summary, host].forEach(function (n) { if (n) n.hidden = on; });
      relabel(s);
      panel.hidden = !on;
      panel.textContent = "";
      if (!on) return;
      const all = (D.picks || []).filter(function (p) { return sportOf(p) === s && today(p); });
      const open = E.sortByProb(E.openOnly(all)), started = all.filter(function (p) { return !E.isOpen(p); });
      const st = sched[s], games = gamesFor(s, st && st.data);
      panel.setAttribute("data-sport", s);
      panel.appendChild(el("p", { class: "filter-summary browse-lead", role: "status" }, lead(s, open, started, games, st)));
      if (open.length) {
        const grid = el("div", { class: "picks-grid stagger" }), spans = new Set(open.map(E.dayKey)).size > 1;
        let prev = null;
        open.forEach(function (p, i) { const k = E.dayKey(p); if (spans && k !== prev) grid.appendChild(E.dayDivider(k)); prev = k; const c = E.pickCard(p, { rank: i + 1 }); c.style.setProperty("--i", i); grid.appendChild(c); });
        panel.appendChild(grid);
        E.initTilt(grid);
      }
      panel.appendChild(gamesBlock(s, games, st));
      linkCards(panel);
      if (window.EdgeLineLive && realData()) { try { const r = window.EdgeLineLive.refresh(); if (r && r.catch) r.catch(function () {}); } catch (e) { /* the page works without live status */ } }
    }
    function go(s, push) {
      current = s;
      if (push) history.pushState({ sport: s }, "", location.pathname + (s ? "?sport=" + encodeURIComponent(s) : ""));
      if (s) ensure(s);
      renderTabs(); renderPanel();
    }
    window.addEventListener("popstate", function () { const s = sportParam(); if (s !== current) go(s, false); });
    /* a sport with no game on the board still gets its tab when its week has one (NFL on a Tuesday, college football before the board carries it) */
    known().forEach(function (s) { if (!boardGames().some(function (g) { return g.sport === s && today(g); }) && LEAGUES[s] && (LEAGUES[s][0].week || s === "Soccer" || (s === "MLB" && mlbSeason()))) ensure(s); });
    go(sportParam(), false);
    /* picks.html?sport=NHL#<lean id>: ring the card in the sport's panel */
    document.addEventListener("DOMContentLoaded", function () {
      if (!current) return;
      const id = location.hash.replace("#", "").replace(/[^\w-]/g, ""), card = id ? panel.querySelector('[data-id="' + id + '"]') : null;
      if (card) { card.classList.add("highlight"); card.scrollIntoView({ block: "center" }); setTimeout(function () { card.classList.remove("highlight"); }, 2600); }
    });
    E.onStateChange(function () { if (current) renderPanel(); });
    return { go: go, current: function () { return current; } };
  }

  /* ---------- game.html: one game ---------- */
  function loadScript(src) {
    return new Promise(function (resolve) { const s = document.createElement("script"); s.src = src; s.onload = s.onerror = function () { resolve(); }; document.head.appendChild(s); });
  }
  function syncStrip() {
    document.querySelectorAll(".subnav a[href^='#']").forEach(function (a) { const t = document.getElementById(a.getAttribute("href").slice(1)); a.hidden = !t || t.hidden; });
  }
  function section(id, title, kids) {
    return el("section", { class: "game-sec", id: id, "aria-labelledby": id + "-h" }, [el("h2", { id: id + "-h", text: title })].concat(kids || []));
  }
  function crumbs(g) {
    const items = [el("li", {}, [el("a", { href: "picks.html", text: W("Leans") })])];
    if (g) {
      items.push(el("li", {}, [el("a", { href: "picks.html?sport=" + encodeURIComponent(g.sport), text: label(g.sport) })]));
      items.push(el("li", { "aria-current": "page", text: shortEvent(g) }));
    } else items.push(el("li", { "aria-current": "page", text: "Game" }));
    return el("nav", { class: "crumbs", "aria-label": "Breadcrumb" }, [el("ol", {}, items)]);
  }
  function hero(g) {
    const st = g.state, sc = scoreOf(g), lean = g.picks[0] || null, t = startOf(g), ctx = (lean && lean.context) || {};
    const leanSide = lean && TM() ? TM().side(lean) : null;
    function teamRow(which) {
      const tm = teamFor(g, which), r = rankOf(g, which);
      const row = el("div", { class: "gb-team" + (leanSide === which ? " is-lean" : "") }, [
        TM() ? TM().logo(tm, g[which], 40) : null,
        el("span", { class: "gb-name" }, [r ? el("span", { class: "bg-rank", text: "#" + r }) : null, teamName(g, which, tm), el("span", { class: "gb-where", text: which === "home" ? "Home" : "Away" })]),
        el("span", { class: "gb-score mono", text: sc ? String(sc[which]) : "" })
      ]);
      if (tm && tm.color) row.style.setProperty("--team", tm.color);
      return row;
    }
    const ev = g.espn;
    const status = el("div", { class: "gb-status" }, [
      stateBadge(st) || el("span", { class: "badge badge-state badge-upcoming", text: "Upcoming" }),
      E.meta([
        st === "live" && sc && sc.detail ? sc.detail : st === "final" ? (sc ? "Final" : "Final score to follow") : st === "awaiting" ? "Past its usual length; the result is graded from the final score" : null,
        Number.isFinite(t) ? (st === "upcoming" || st === "soon" ? (g.tbd ? "Kickoff time to be set" : untilText(t)) : "Started " + E.clockET(t)) : g.start || null
      ], "gb-when"),
      lean && st === "live" && !(ev && ev.state === "in") ? E.liveSlot(lean.id) : null
    ]);
    const leanLine = lean ? el("a", { class: "gb-lean", href: "#lean" }, [el("span", { class: "gb-lean-k", text: "Our " + W("lean") }), el("strong", { text: lean.pick }), el("span", { class: "mono", text: E.fmtOdds(lean.odds) }), lean.book ? el("span", { text: lean.book }) : null]) : null;
    const updated = g.id && g.rows.length ? el("p", { class: "gb-updated" }) : null;
    const box = el("div", { class: "game-top", id: "game" }, [
      el("div", { class: "page-head game-head" }, [
        el("h1", { class: "page-title game-page-title", text: longEvent(g) }),
        el("p", { class: "muted page-sub" }, [E.meta([el("span", { class: "badge badge-sport", "data-sport": g.sport, text: label(g.sport) }), g.league && g.league !== g.sport ? g.league : null, Number.isFinite(t) ? (g.tbd ? shortDay(keyOf(t)) + ", time to be set" : whenLong(t)) : g.start || null, ctx.venue || (ev && ev.venue) || null, ctx.broadcast || (ev && ev.tv) || null], "game-sub")])
      ]),
      el("div", { class: "card game-board" + (sc && sc.live ? " is-live" : "") }, order(g).map(teamRow).concat([status, leanLine, updated]))
    ]);
    if (updated) E.updateLine(updated, { lines: true, sport: g.sport });
    return box;
  }
  function resultSec(g) {
    const st = g.state;
    if (st !== "final" && st !== "awaiting") return null;
    const kids = [], graded = g.picks.filter(function (p) { return E.gameState(p) === "final"; }), sc = scoreOf(g), sides = order(g);
    const P = window.PERF_DATA;
    graded.forEach(function (p) {
      const u = Number(p.units), perf = P && Array.isArray(P.recent) ? P.recent.find(function (r) { return r.event === p.event && r.pick === p.pick; }) : null;
      /* only a believable close: an in-game price logged as the close (+1281 against a +110 moneyline) says nothing about the price */
      const clv = perf && perf.clv != null && Number.isFinite(Number(perf.clv)) && Math.abs(Number(perf.clv)) <= 0.15 ? Number(perf.clv) : NaN;
      kids.push(el("div", { class: "game-result" }, [
        el("p", { class: "game-result-line" }, [E.stateChip(p), el("strong", { text: p.pick }), E.meta([E.scoreText(p) ? "Final " + E.scoreText(p) : null, E.unitsText(p) ? E.unitsText(p) + " for one unit" : E.resultWord(p) === "Void" ? "No action, stake back" : null, "posted " + E.fmtOdds(p.odds) + (p.book ? " at " + p.book : "")], "game-result-meta")]),
        el("p", { class: "game-result-note" + (u > 0 ? " pos" : u < 0 ? " neg" : ""), text: (Number.isFinite(clv) ? (clv >= 0 ? "The price we took beat the closing line by " : "The closing line beat the price we took by ") + Math.abs(clv * 100).toFixed(1) + " points" + (perf.closeSource ? " (" + perf.closeSource + ")" : "") + ". That is a market measure; the grade is the result. " : "") + "Graded at the posted price from the final score; the full record is on the Performance page." })
      ]));
    });
    if (!graded.length && g.picks.length) kids.push(el("p", { class: "game-result-note", text: "Awaiting the grade: the hourly check grades our " + W("lean") + " from the final score, at the posted price." }));
    if (!g.picks.length) kids.push(el("p", { class: "game-result-note", text: (sc && st === "final" ? "Final " + teamAbbr(g, sides[0]) + " " + sc[sides[0]] + "–" + sc[sides[1]] + " " + teamAbbr(g, sides[1]) + ". " : st === "final" ? "Final. " : "Past its usual length; the final score is still to come. ") + "We had no " + W("lean") + " on this game." }));
    return section("result", "Result", kids);
  }
  function leanSec(g) {
    const kids = [], st = g.state;
    if (g.picks.length) {
      const grid = el("div", { class: "game-lean" });
      g.picks.forEach(function (p, i) { grid.appendChild(E.pickCard(p, { rank: g.picks.length > 1 ? i + 1 : null })); });
      kids.push(el("p", { class: "muted how-to", text: "Locked once posted and graded at the posted price. If a later check finds it under its bar, the card says so; the bar line under the numbers is the edge it had to clear." }));
      kids.push(grid);
      E.initTilt(grid);
    } else if (g.id && g.rows.length) {
      const best = g.rows.filter(E.hasModel).sort(function (a, b) { return pastNum(b) - pastNum(a); })[0];
      /* why there is none, from the data: every side short of its bar (the closest, and how far), a side past its bar in
         a game that is held for its news (the rows' `waiting`: why, and when it is decided), or a side the caps kept off */
      const open = st === "upcoming" || st === "soon", held = !!best && open && E.isHeld(best);
      const heldText = held ? E.heldWhy(best) + ". " + E.heldWhen(best) : "";
      const tail = !best ? " The game has no model yet, so no side has a probability."
        : pastNum(best) < 0 ? " no side cleared its own bar. The closest, " + best.pick + " at " + E.fmtOdds(best.odds) + (best.book ? " (" + best.book + ")" : "") + ", is " + E.barGap(best) + "." + (E.clearText(best) && open ? " It " + E.clearText(best) + "." : "") + (held ? " The game is held too: " + heldText : "")
        : held ? " " + best.pick + " clears " + E.barName(best) + ", but the game is held: " + heldText + " It posts then only if it still clears its bar."
        : " " + best.pick + " cleared " + E.barName(best) + " but the caps kept it off the board: one " + W("lean") + " a game, ten a day and five per sport.";
      kids.push(el("p", { class: "game-none" }, [el("strong", { text: "No " + W("lean") + " on this game" + (best ? ":" : ".") }), tail]));
    } else if (st === "upcoming" || st === "soon") {
      const t = firstRun(g.sport, startOf(g));
      kids.push(Number.isFinite(t) && t > E.now()
        ? el("p", { class: "game-none" }, [el("strong", { text: "We price this game from " + runWord(t) + "." }), " That pricing run, about " + timeET(t) + ", is the first with the game inside the 36 hours the odds are asked for. A " + W("lean") + " is posted only if a side clears its own bar."])
        : el("p", { class: "game-none" }, [el("strong", { text: "Not priced yet." }), " The last pricing run had no lines for it; the next one for " + lab(g.sport) + " is " + E.aboutET(nextRunFor(g.sport)) + "."]));
    } else kids.push(el("p", { class: "game-none", text: "We did not price this game." }));
    return section("lean", "Our " + W("lean"), kids);
  }
  function sidesSec(g) {
    if (!g.rows.length) return null;
    const leanOf = function (r) {
      return g.picks.some(function (p) { return (r.pickId && r.pickId === p.id) || (r.pick && r.pick === p.pick && (!p.marketKey || p.marketKey === r.marketKey)) || (p.marketKey === r.marketKey && p.outcome && r.outcome && p.outcome.name === r.outcome.name && ((p.outcome.point == null && r.outcome.point == null) || Number(p.outcome.point) === Number(r.outcome.point))); });
    };
    const rows = g.rows.slice().sort(function (a, b) { return ((E.rowEdge(b) > 0) - (E.rowEdge(a) > 0)) || (E.probOf(b) - E.probOf(a)) || (E.rowEdge(b) - E.rowEdge(a)); });
    const cols = ["#", "Market", "Side", "Best price", "Book", "To hit", "Implied", "Edge", "Clears from"];
    const started = g.state !== "upcoming" && g.state !== "soon", held = !started && !g.picks.length && g.rows.some(E.isHeld) ? g.rows.filter(E.isHeld)[0] : null;
    const body = rows.map(function (r, i) {
      const isLean = leanOf(r), modelled = E.hasModel(r);
      const tr = el("tr", { class: (isLean ? "is-lean" : "") + (modelled ? "" : " no-model") }, [
        el("td", { class: "num" }, [E.rankChip(i + 1, true)]),
        el("td", { text: r.market }),
        el("td", {}, [el("strong", { text: r.pick }), isLean ? el("span", { class: "badge badge-status badge-pick sides-lean", text: "Our " + W("lean") }) : !started && E.heldClears(r) ? el("span", { class: "badge badge-status badge-held sides-lean", title: E.heldNote(r), text: "Held" }) : null]),
        el("td", { class: "num mono", text: E.fmtOdds(r.odds) }),
        el("td", { text: r.book || "" }),
        el("td", { class: "num mono", text: E.probText(r), title: modelled ? "Our probability, from the game data" : "No model yet for this game" }),
        el("td", { class: "num mono", text: E.pct(E.impliedProb(r.odds)) }),
        modelled ? el("td", { class: "num mono", title: "Its bar " + E.barPts(r) + " points: " + E.pastWord(r) }, [el("span", { text: E.signed(Number(r.edge) * 100, 1) }), E.hasOwnBar(r) ? el("span", { class: "sides-bar", text: "bar " + E.barPts(r) }) : null]) : el("td", { class: "num muted", text: "No model yet" }),
        /* the price at which a side short of its bar would clear it (EdgeLine.clearFor, the pipeline's valueTo); a side past its bar says so */
        (function () { const v = modelled ? E.clearFor(r) : null, past = modelled && E.pastOf(r) >= 0; return el("td", { class: "num mono" + (v == null ? " muted" : ""), title: v != null ? "The price at which our probability would clear this side’s bar; best now " + E.fmtOdds(r.odds) : null, text: v != null ? E.fmtOdds(v) : past ? "Past its bar" : "—" }); })()
      ]);
      Array.prototype.forEach.call(tr.children, function (td, j) { td.setAttribute("data-label", cols[j]); });
      return tr;
    });
    return section("sides", "Every side we priced", [
      el("p", { class: "muted how-to", text: "Sides with a positive edge first, then the rest, each likeliest first by our probability from the game data. There is one " + W("lean") + " a game, the side furthest past its own bar" + (g.picks.length ? ", marked here; the others are information, not bets." : held ? "; none is posted while the game is held (" + E.heldWhy(held) + "), and a side past its bar is marked Held." : "; none cleared it on this game.") + " The price is the best one we found and the book that has it." + (started ? "" : " Clears from is the price at which a side short of its bar would clear it.") + (started ? " The lines closed at the start; these are the prices from the last pricing run." : "") }),
      el("div", { class: "table-wrap sides-table", role: "region", tabindex: "0", "aria-label": "Every side we priced on " + g.event }, [el("table", { class: "data" }, [el("thead", {}, [el("tr", {}, cols.map(function (c, i) { return el("th", { scope: "col", class: i === 0 || i === 3 || i >= 5 ? "num" : "", title: i === 8 ? "The price at which a side short of its bar would clear it" : null, text: c }); }))]), el("tbody", {}, body)])])
    ]);
  }
  function statusClass(st) { return /^(out|injured|ir|doubtful|suspended)/i.test(st || "") ? "inj-out" : st ? "inj-q" : ""; }
  function whySec(g) {
    const lean = g.picks[0] || null, kids = [];
    const list = function (title, items, cls) { return items && items.length ? el("div", { class: "bd-block" }, [el("h3", { class: "why-h", text: title }), el("ul", { class: "bd-list " + cls }, items.map(function (t) { return el("li", { text: tierText(t) }); }))]) : null; };
    if (lean) {
      const b = lean.breakdown;
      if (E.flagOf(lean)) kids.push(E.flagLine(lean, "why-flag"));
      kids.push(el("div", { class: "bd-block" }, [el("h3", { class: "why-h", text: "Why " + tierLabel((b && b.tier) || lean.confidence || "") }), el("p", { text: tierText((b && b.tierWhy) || E.barSentence(lean) || lean.rationale || "") })]));
      if (b && b.price) kids.push(el("div", { class: "bd-block" }, [el("h3", { class: "why-h", text: "The number" }), el("p", { text: tierText(b.price) })]));
      if (b) [list("What supports it", b.support, "bd-support"), list("What could go wrong", b.risks, "bd-risk"), list("Also worth knowing", b.notes, "bd-note")].forEach(function (n) { if (n) kids.push(n); });
      else { if (lean.rationale) kids.push(el("p", { text: tierText(lean.rationale) })); const f = list("The factors", lean.factors, "bd-note"); if (f) kids.push(f); }
      if (b && b.verdict) kids.push(el("p", { class: "bd-verdict", text: tierText(b.verdict) }));
    } else if (g.rows.some(E.hasModel)) {
      const r = g.rows.find(function (x) { return x.model && (typeof x.model.margin === "number" || typeof x.model.total === "number"); });
      if (r) {
        const m = r.model, u = UNITS[g.sport] || "points", parts = [];
        if (typeof m.margin === "number") parts.push(Math.abs(m.margin) < 0.05 ? "An even game" : (m.margin > 0 ? teamName(g, "home") : teamName(g, "away")) + " by " + Math.abs(m.margin).toFixed(1) + " " + u);
        if (typeof m.total === "number") parts.push("a total of " + Number(m.total).toFixed(1) + " " + u);
        if (typeof m.gp === "number") parts.push(m.gp + (m.gp === 1 ? " game" : " games") + " behind it" + (m.thin ? ", a thin sample" : ""));
        kids.push(el("div", { class: "bd-block" }, [el("h3", { class: "why-h", text: "What the model projects" }), el("p", { text: parts.join(", ") + "." }), el("p", { class: "muted", text: "Every side’s probability comes from that projection and the league’s own spread of results. A side becomes a " + W("lean") + " only when its edge over the best price clears its bar, the model’s own margin of error on it." })]));
      }
    }
    const grid = el("div", { class: "bd-grid" });
    const inj = lean && lean.context && lean.context.injuries ? lean.context.injuries : null;
    const teams = inj ? Object.keys(inj) : [];
    if (teams.length) grid.appendChild(el("div", { class: "bd-cell bd-wide" }, [el("h3", { class: "why-h", text: "Injury report" })].concat(teams.map(function (t) {
      const items = inj[t] || [];
      return el("div", { class: "bd-team" }, [el("strong", { text: t }), items.length ? el("ul", { class: "bd-inj" }, items.map(function (i) { return el("li", {}, [TM() && (i.athleteId || i.headshot) ? TM().face(lean.sportKey, { id: i.athleteId, name: i.name, headshot: i.headshot }, 28) : null, el("span", { class: "inj-status " + statusClass(i.status), text: i.status || "" }), " " + i.name + (i.pos ? " (" + i.pos + ")" : ""), i.type || i.returnDate ? E.meta([i.type || null, i.returnDate ? "back " + i.returnDate : null], "inj-meta") : null]); })) : el("p", { class: "small muted", text: "No one listed." })]);
    }))));
    const known = TM() ? TM().faces(lean || g, { perTeam: 4, px: 48, title: false }) : null;
    if (known) grid.appendChild(el("div", { class: "bd-cell bd-wide" }, [el("h3", { class: "why-h", text: "Names to know" }), known]));
    if (grid.children.length) kids.push(grid);
    if (lean) kids.push(el("p", { class: "why-more" }, [el("button", { type: "button", class: "flip-btn", "data-breakdown": lean.id, text: "Full breakdown: line movement, line shopping, rest and records" })]));
    if (!kids.length) return null;
    return section("why", lean ? "Why" : "Why no " + W("lean"), kids);
  }
  /* ---------- player props for this game, from data/props.js: by event id when the file carries one, else by the two teams and the day ---------- */
  const STAT_LABEL = { pts: "Points", reb: "Rebounds", ast: "Assists", threes: "Threes", pra: "Pts + reb + ast" };
  function statLabel(k) { return STAT_LABEL[k] || String(k).replace(/_/g, " ").replace(/^\w/, function (c) { return c.toUpperCase(); }); }
  function nameOf(x) { return x && typeof x === "object" ? x.name || x.displayName || "" : String(x || ""); }
  function sameTeam(a, b, key) {
    if (!a || !b) return false;
    const tm = TM();
    if (tm) { const x = tm.find(key, a), y = tm.find(key, b); if (x && y) return String(x.id) === String(y.id); }
    return norm(a) === norm(b) || !!(tm && tm.clubCore && tm.clubCore(a) === tm.clubCore(b));
  }
  function propsFor(g) {
    const D = window.PROPS_DATA;
    if (!D || !Array.isArray(D.players) || !D.players.length) return [];
    const key = g.sportKey || g.sport, t0 = startOf(g), id = g.id;
    const ids = (D.games || []).filter(function (x) {
      if (!x) return false;
      if (x.eventId && id && String(x.eventId) === String(id)) return true;
      if (x.sport && x.sport !== g.sport) return false;
      const ts = Date.parse(x.start || x.commence || "");
      if (Number.isFinite(ts) && Number.isFinite(t0) && Math.abs(ts - t0) > 12 * 36e5) return false;
      const h = nameOf(x.home), a = nameOf(x.away);
      return (sameTeam(h, g.home, key) && sameTeam(a, g.away, key)) || (sameTeam(h, g.away, key) && sameTeam(a, g.home, key));
    }).map(function (x) { return String(x.id); });
    return D.players.filter(function (p) {
      if (!p) return false;
      if (p.eventId && id && String(p.eventId) === String(id)) return true;
      if (p.sport && p.sport !== g.sport) return false;
      if (ids.length) return ids.indexOf(String(p.gameId)) >= 0;
      return (sameTeam(p.team, g.home, key) || sameTeam(p.team, g.away, key)) && (!D.date || D.date === keyOf(t0));
    });
  }
  function propsSec(g) {
    if (!PROPS_SPORTS[g.sport]) return null;
    const players = propsFor(g);
    if (!players.length) return null;
    const key = g.sportKey || (g.sport === "NBA" ? "basketball_nba" : g.sport === "NFL" ? "americanfootball_nfl" : null);
    const pts = function (p) { const s = p.stats && p.stats.pts; return s && Number.isFinite(Number(s.season)) ? Number(s.season) : -1; };
    const groups = order(g).map(function (which) { return { which: which, list: players.filter(function (p) { return sameTeam(p.team, g[which], g.sportKey || g.sport); }) }; });
    const rest = players.filter(function (p) { return !groups.some(function (gr) { return gr.list.indexOf(p) >= 0; }); });
    if (rest.length) groups.push({ which: null, list: rest });
    const anyLines = players.some(function (p) { return p.lines && Object.keys(p.lines).length; });
    const kids = [el("p", { class: "muted how-to", text: (anyLines ? "Tonight’s posted lines, and each player’s season average where there is none. " : "No lines posted yet (the books post most of them in the afternoon), so each player shows his season average. ") + "Ordered by scoring this season. Each line’s grade, our probability from the game data, likeliest first, is on the props page." })];
    groups.forEach(function (gr) {
      if (!gr.list.length) return;
      const t = gr.which ? teamFor(g, gr.which) : null;
      kids.push(el("div", { class: "game-props-team" }, [
        el("h3", { class: "why-h" }, [t && TM() ? TM().logo(t, g[gr.which], 24) : null, gr.which ? teamName(g, gr.which, t) : "Others"]),
        propList(gr.list.slice().sort(function (a, b) { return pts(b) - pts(a); }).map(function (p) {
          const lines = p.lines || {}, keys = Object.keys(lines).length ? Object.keys(lines) : ["pts", "reb", "ast"].filter(function (k) { return p.stats && p.stats[k]; });
          const parts = keys.slice(0, 3).map(function (k) {
            const ln = lines[k];
            if (ln && ln.line != null) return statLabel(k) + ": line " + ln.line;
            const s = p.stats && p.stats[k];
            return s && Number.isFinite(Number(s.season)) ? statLabel(k) + " " + Number(s.season).toFixed(1) + " a game" : null;
          });
          return el("li", { class: "game-prop" }, [
            TM() ? TM().face(key, { id: p.id, name: p.name, headshot: p.headshot }, 40) : null,
            el("span", { class: "game-prop-who" }, [
              el("a", { href: "props.html?q=" + encodeURIComponent(p.name), text: p.name }),
              E.meta([p.pos || null, p.injury ? el("span", { class: "inj-status " + statusClass(p.injury), text: p.injury }) : null], "game-prop-sub")
            ]),
            E.meta(parts, "game-prop-stats")
          ]);
        }))
      ]));
      function propList(items) {
        if (items.length <= 6) return el("ul", { class: "game-props" }, items);
        return el("div", { class: "game-props-wrap" }, [el("ul", { class: "game-props" }, items.slice(0, 5)), el("details", { class: "game-props-more" }, [el("summary", { text: (items.length - 5) + " more on " + (gr.which ? teamName(g, gr.which, t) : "the roster") }), el("ul", { class: "game-props" }, items.slice(5))])]);
      }
    });
    kids.push(el("p", { class: "why-more" }, [el("a", { class: "flip-btn", href: "props.html", text: "Open the props board" })]));
    return section("props", "Player props", kids);
  }
  function renderMissing(root, why) {
    root.textContent = "";
    document.title = "Game not found · EdgeLine AI";
    root.appendChild(crumbs(null));
    const searchBtn = el("button", { type: "button", class: "btn btn-secondary btn-sm", text: "Search teams and games" });
    searchBtn.addEventListener("click", function () { if (window.EdgeLineSearch) window.EdgeLineSearch.open(); });
    root.appendChild(el("div", { class: "game-top", id: "game" }, [
      el("div", { class: "page-head" }, [el("h1", { class: "page-title", text: why === "espn" ? "We could not load that game" : "That game is not on the board" })]),
      el("div", { class: "card game-missing" }, [
        el("p", { text: why === "espn" ? "ESPN’s schedule did not answer for it just now. Try again in a minute, or find it from today’s lists." : "The link may be old: a game stays here until about 18 hours after it starts, and its result then lives in the record on the Performance page. Or the address is incomplete." }),
        el("ul", { class: "game-missing-links" }, [
          el("li", {}, [el("a", { href: "picks.html", text: "Today’s " + W("leans") + ", likeliest first" })]),
          el("li", {}, [el("a", { href: "games.html", text: "Every game on the board, with its lines" })]),
          el("li", {}, [el("a", { href: "performance.html", text: "The record: every graded " + W("lean") })])
        ]),
        searchBtn
      ])
    ]));
    syncStrip();
  }
  function fetchEvent(lg, id, date) {
    const want = function (d) { return d ? eventsOf(d, lg).find(function (ev) { return ev.espnId === String(id); }) || null : null; };
    return getJSON(sbURL(lg, date ? "dates=" + date : "")).then(function (d) {
      const ev = want(d);
      return ev || !date ? ev : getJSON(sbURL(lg)).then(want);
    });
  }
  function initGame(root) {
    const q = new URLSearchParams(location.search), id = String(q.get("id") || "").trim(), espnId = String(q.get("espn") || "").trim();
    const key = String(q.get("league") || ""), date = String(q.get("date") || "").replace(/\D/g, "").slice(0, 8);
    let g = id ? boardGames().find(function (x) { return x.aliases.indexOf(id) >= 0; }) || null : null;
    let timer = null;
    function render() {
      g.state = stateOf(g);
      root.textContent = "";
      document.title = shortEvent(g) + " · EdgeLine AI";
      root.appendChild(crumbs(g));
      root.appendChild(hero(g));
      [resultSec(g), leanSec(g), sidesSec(g), whySec(g), propsSec(g)].forEach(function (s) { if (s) root.appendChild(s); });
      syncStrip();
    }
    function extras() {
      const jobs = [];
      if (g.sport === "NBA" && !window.FACES_DATA) jobs.push(loadScript("data/faces.js"));
      if (PROPS_SPORTS[g.sport] && !window.PROPS_DATA) jobs.push(loadScript("data/props.js"));
      if ((g.state === "final" || g.state === "awaiting") && g.picks.length && !window.PERF_DATA) jobs.push(loadScript("data/performance.js"));
      if (jobs.length) Promise.all(jobs).then(render);
      /* the live score or the final from ESPN once the game has started (real data; js/live.js fills the lean's own pill) */
      const lg = leagueOfKey(g.sportKey);
      if (lg && realData() && g.state !== "upcoming" && g.state !== "soon" && !(g.espn && g.espn.state === "post")) {
        const look = function (fresh) {
          return getJSON(sbURL(lg, "dates=" + keyOf(startOf(g)).replace(/-/g, "")), fresh).then(function (d) {
            const ev = d ? eventsOf(d, lg).find(function (x) { return (g.espnId && x.espnId === g.espnId) || sameGame(g, x); }) : null;
            if (ev) { g.espn = ev; render(); }
            if (ev && ev.state === "in" && !timer) timer = setInterval(function () { if (!document.hidden) look(true); }, 60e3);
            if (timer && (!ev || ev.state !== "in")) { clearInterval(timer); timer = null; }
          });
        };
        look(false);
      }
    }
    if (g) { render(); extras(); E.onStateChange(render); return; }
    const lg = espnId && /^\d+$/.test(espnId) ? leagueOfKey(key) : null;
    if (lg) {
      root.textContent = "";
      root.appendChild(crumbs(null));
      root.appendChild(el("div", { class: "game-top", id: "game" }, [el("div", { class: "page-head" }, [el("h1", { class: "page-title", text: label(lg.sport) + " game" }), el("p", { class: "muted page-sub", role: "status", text: "Loading the game from ESPN…" })])]));
      syncStrip();
      fetchEvent(lg, espnId, date).then(function (ev) {
        if (!ev) { renderMissing(root, "espn"); return; }
        g = boardGames().find(function (b) { return b.sport === lg.sport && sameGame(b, ev); }) || null;
        if (g) g.espn = ev; else g = fromEspn(ev);
        render(); extras(); E.onStateChange(render);
      });
      return;
    }
    renderMissing(root);
  }

  /* ---------- start ---------- */
  const browseMount = document.getElementById("browse"), gameRoot = document.getElementById("game-page");
  const picks = browseMount ? initPicks(browseMount) : null;
  if (gameRoot) initGame(gameRoot);
  else {
    linkCards(document);
    if ("MutationObserver" in window && document.body) {
      let queued = false;
      new MutationObserver(function () { if (queued) return; queued = true; requestAnimationFrame(function () { queued = false; linkCards(document); }); }).observe(document.body, { childList: true, subtree: true });
    }
  }

  window.EdgeLineBrowse = {
    order: ORDER.slice(), label: label, sportOf: sportOf, boardGames: boardGames, gamesFor: gamesFor, hrefFor: hrefFor, gameOfPick: gameOfPick, linkCards: linkCards,
    firstRun: firstRun, runWord: runWord, scheduleFor: scheduleFor, propsFor: propsFor, picks: picks
  };
})();
