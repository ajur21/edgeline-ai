/* ==========================================================================
   EdgeLine AI — live in-game status
   Once a game on the board starts, every card for it shows where the pick
   stands: score, clock, and "covering by 3.5" / "needs 7 more" / "leading by 4".
   Source: ESPN's public scoreboard (no key, CORS open), polled from the
   visitor's browser once a minute while a game is in progress and only while
   the tab is visible. Nothing here grades a pick: the pipeline does that from
   final scores. A finished game shows an unofficial result until then.
   Fills every element with data-live="<pick id>" (see EdgeLine.liveSlot).
   Exposes window.EdgeLineLive = { pickState, outcomeOf, findGame, refresh }.
   ========================================================================== */
(function () {
  "use strict";
  const ESPN = { americanfootball_nfl: "football/nfl", americanfootball_ncaaf: "football/college-football", basketball_nba: "basketball/nba", baseball_mlb: "baseball/mlb", icehockey_nhl: "hockey/nhl", soccer_epl: "soccer/eng.1", soccer_spain_la_liga: "soccer/esp.1", soccer_usa_mls: "soccer/usa.1" };
  const BY_LEAGUE = { NFL: "football/nfl", NCAAF: "football/college-football", NBA: "basketball/nba", MLB: "baseball/mlb", NHL: "hockey/nhl", "Premier League": "soccer/eng.1", "La Liga": "soccer/esp.1", MLS: "soccer/usa.1" };
  /* college football: ESPN's date scoreboard lists only the top games unless asked for every FBS game (groups=80) and a limit
     past a Saturday's 55 or more */
  const QUERY = { "football/college-football": "&groups=80&limit=300" };
  const ET = "America/New_York";
  const BEFORE_MS = 20 * 60e3, AFTER_MS = 5 * 36e5; /* watch a game from 20 minutes before tip-off to 5 hours after */
  const POLL_LIVE = 60e3, POLL_IDLE = 5 * 60e3;

  function etDate(d) { return new Intl.DateTimeFormat("en-CA", { timeZone: ET, year: "numeric", month: "2-digit", day: "2-digit" }).format(d); }
  function norm(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
  function teamMatches(name, team) {
    if (!name || !team) return false;
    const n = norm(name), d = norm(team.displayName), nick = norm(team.name), loc = norm(team.location), short = norm(team.shortDisplayName), abbr = norm(team.abbreviation);
    return n === d || n === short || n === abbr || (nick && n.endsWith(nick) && (loc === "" || n.indexOf(loc.slice(0, 4)) !== -1)) || (loc && n === loc) || (window.EdgeLineTeams && window.EdgeLineTeams.clubCore ? window.EdgeLineTeams.clubCore(name) === window.EdgeLineTeams.clubCore(team.displayName) : false);
  }
  /* the side a pick is on, from the pipeline's outcome or, failing that, the pick label */
  function outcomeOf(p) {
    if (p.outcome && p.outcome.name) return { name: p.outcome.name, point: p.outcome.point == null ? null : Number(p.outcome.point) };
    const label = String(p.pick || "");
    if (p.marketKey === "totals" || /^(over|under)\b/i.test(label)) { const m = label.match(/^(Over|Under)\s+(-?\d+(\.\d+)?)/i); return m ? { name: m[1][0].toUpperCase() + m[1].slice(1).toLowerCase(), point: Number(m[2]) } : null; }
    if (label === "Draw") return { name: "Draw", point: null };
    if (/\sML$/.test(label)) return { name: label.replace(/\sML$/, ""), point: null };
    const m = label.match(/^(.*)\s([+-]\d+(\.\d+)?)$/);
    return m ? { name: m[1], point: Number(m[2]) } : { name: label, point: null };
  }
  /* find the pick's game on a scoreboard: by ESPN event id when the pipeline matched it, else by team names */
  function findGame(sb, p) {
    const events = (sb && sb.events) || [];
    const id = p.context && p.context.espnEventId;
    let ev = id ? events.find(e => String(e.id) === String(id)) : null;
    if (!ev) ev = events.find(function (e) {
      const c = e.competitions && e.competitions[0]; if (!c) return false;
      const h = c.competitors.find(x => x.homeAway === "home"), a = c.competitors.find(x => x.homeAway === "away");
      return h && a && teamMatches(p.home, h.team) && teamMatches(p.away, a.team);
    });
    if (!ev) return null;
    const c = ev.competitions[0], h = c.competitors.find(x => x.homeAway === "home"), a = c.competitors.find(x => x.homeAway === "away");
    const st = (c.status || ev.status || {}), type = st.type || {};
    return {
      id: ev.id, state: type.state || "pre", completed: !!type.completed, detail: type.shortDetail || type.detail || "", clock: st.displayClock || "", period: st.period || 0,
      home: { name: h.team.displayName, abbr: h.team.abbreviation, score: Number(h.score), team: h.team },
      away: { name: a.team.displayName, abbr: a.team.abbreviation, score: Number(a.score), team: a.team }
    };
  }
  /* where the pick stands given the live score. tone: good | bad | flat */
  function pickState(p, g) {
    const o = outcomeOf(p); if (!o) return null;
    const hs = g.home.score, as = g.away.score;
    if (!Number.isFinite(hs) || !Number.isFinite(as)) return null;
    const total = hs + as, fin = g.state === "post";
    let text, tone;
    if (o.name === "Over" || o.name === "Under") {
      const diff = total - o.point;
      if (o.name === "Over") { text = diff > 0 ? "over by " + fmtNum(diff) : diff === 0 ? "on the number" : "needs " + fmtNum(-diff) + " more"; tone = diff > 0 ? "good" : diff === 0 ? "flat" : fin ? "bad" : "flat"; }
      else { text = diff < 0 ? fmtNum(-diff) + " under the line" : diff === 0 ? "on the number" : "over the line by " + fmtNum(diff); tone = diff < 0 ? "good" : diff === 0 ? "flat" : "bad"; }
    } else if (o.name === "Draw") {
      text = hs === as ? "level" : "not level"; tone = hs === as ? "good" : "bad";
    } else {
      const mineHome = teamMatches(o.name, g.home.team), mineAway = teamMatches(o.name, g.away.team);
      if (!mineHome && !mineAway) return null;
      const mine = mineHome ? hs : as, theirs = mineHome ? as : hs, margin = mine - theirs;
      if (o.point == null) { text = margin > 0 ? "leading by " + fmtNum(margin) : margin < 0 ? "trailing by " + fmtNum(-margin) : "tied"; tone = margin > 0 ? "good" : margin < 0 ? "bad" : "flat"; }
      else { const cover = margin + o.point; text = cover > 0 ? "covering by " + fmtNum(cover) : cover < 0 ? "needs " + fmtNum(-cover) + " more" : "on the number"; tone = cover > 0 ? "good" : cover < 0 ? "bad" : "flat"; }
    }
    if (fin) text = tone === "good" ? "won (unofficial)" : tone === "bad" ? "lost (unofficial)" : "push (unofficial)";
    return { text: text, tone: tone, score: g.away.abbr + " " + as + "–" + hs + " " + g.home.abbr };
  }
  function fmtNum(n) { return Number.isInteger(n) ? String(n) : n.toFixed(1); }
  function clockLabel(g) {
    if (g.state === "post") return "Final";
    if (g.state !== "in") return g.detail || "Pre-game";
    return g.detail || (g.clock ? g.clock + " · P" + g.period : "Live");
  }

  function render(slot, p, g) {
    slot.textContent = "";
    if (!g || g.state === "pre") { slot.removeAttribute("data-state"); return; }
    const st = pickState(p, g);
    const pill = document.createElement("span");
    pill.className = "live-pill state-" + g.state + (st ? " tone-" + st.tone : "");
    const dot = document.createElement("span"); dot.className = "live-dot"; dot.setAttribute("aria-hidden", "true"); pill.appendChild(dot);
    const parts = [g.state === "in" ? "LIVE · " + clockLabel(g) : "Final", st ? st.score : g.away.abbr + " " + g.away.score + "–" + g.home.score + " " + g.home.abbr, st ? st.text : null].filter(Boolean);
    parts.forEach(function (t, i) { const s = document.createElement("span"); s.className = i === 0 ? "live-clock" : i === 1 ? "live-score mono" : "live-state"; s.textContent = t; pill.appendChild(s); });
    slot.appendChild(pill);
    slot.setAttribute("data-state", g.state);
  }

  const cache = {};
  async function scoreboard(path, yyyymmdd) {
    const key = path + "|" + yyyymmdd;
    if (cache[key] && Date.now() - cache[key].at < 20e3) return cache[key].data;
    try {
      const res = await fetch("https://site.api.espn.com/apis/site/v2/sports/" + path + "/scoreboard?dates=" + yyyymmdd + (QUERY[path] || ""), { headers: { accept: "application/json" } });
      if (!res.ok) return null;
      const data = await res.json();
      cache[key] = { at: Date.now(), data: data };
      return data;
    } catch (e) { return null; }
  }
  function picksOnPage() {
    const D = window.PICKS_DATA; if (!D) return [];
    const all = (D.picks || []).concat(D.playOfDay ? [D.playOfDay] : []);
    const byId = {}; all.forEach(p => { if (!byId[p.id]) byId[p.id] = p; });
    const ids = {}; document.querySelectorAll("[data-live]").forEach(s => { ids[s.getAttribute("data-live")] = true; });
    return Object.keys(ids).map(id => byId[id]).filter(Boolean);
  }
  function inWindow(p, now) {
    const t = Date.parse(p.commence);
    if (!Number.isFinite(t)) return true; /* no start time known: check today's scoreboard */
    return now >= t - BEFORE_MS && now <= t + AFTER_MS;
  }
  let timer = null, anyLive = false;
  async function refresh() {
    /* the site's one clock (EdgeLine.now), so a pinned test clock and the pages agree on which games have started */
    const now = window.EdgeLine && window.EdgeLine.now ? window.EdgeLine.now() : Date.now();
    const picks = picksOnPage().filter(p => inWindow(p, now));
    anyLive = false;
    for (const p of picks) {
      const path = ESPN[p.sportKey] || BY_LEAGUE[p.league]; if (!path) continue;
      const t = Date.parse(p.commence);
      const sb = await scoreboard(path, etDate(Number.isFinite(t) ? new Date(t) : new Date(now)).replace(/-/g, ""));
      const g = sb ? findGame(sb, p) : null;
      if (g && g.state === "in") anyLive = true;
      document.querySelectorAll('[data-live="' + p.id.replace(/"/g, "") + '"]').forEach(slot => render(slot, p, g));
    }
    return picks.length;
  }
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(tick, anyLive ? POLL_LIVE : POLL_IDLE);
  }
  async function tick() {
    if (document.hidden) { schedule(); return; }
    try { await refresh(); } catch (e) { /* the page works without live status */ }
    schedule();
  }
  document.addEventListener("visibilitychange", function () { if (!document.hidden) tick(); });
  document.addEventListener("DOMContentLoaded", function () {
    const D = window.PICKS_DATA;
    if (!D || D.sample !== false || !document.querySelector("[data-live]")) return; /* sample boards have no real games to follow */
    tick();
  });
  window.EdgeLineLive = { pickState: pickState, outcomeOf: outcomeOf, findGame: findGame, refresh: refresh };
})();
