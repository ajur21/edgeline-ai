/* ==========================================================================
   EdgeLine AI — the play of the day and the parlay of the day (2026-11-11)
   Owner: "the picks for parlays or plays of the day can also be props. It's
   ANY play." Until now both were chosen from the game leans alone, inside the
   odds run, at the first run of the day with a lean, by expected value.

   The rule now (the owner's three choices, 2026-11-11):
   - the candidates are every play of today's games (Eastern), game leans and
     player props together: js/plays.js, the same list the home page ranks;
   - the play of the day is the one likeliest to hit that still beats its
     price. A prop's chance is the board's stated chance checked against the
     props record (PROPS_DATA.results.check); a prop is still graded on game
     data only, its price only says where to bet and whether it is worth it;
   - the parlay of the day is the likeliest two plays from different games at
     one book, each beating its price there. A leg can be a lean or a prop;
   - both lock at the afternoon run (3:30 PM ET), when game lines and prop
     lines are both in. A play that starts before that run can be trusted to
     have happened (RULES.earlyMs after its slot) locks at the morning run.
     One play and one parlay a day, never swapped, whatever a later run finds.

   Why it is a step of its own: a full run refreshes the props (lines included)
   after scripts/update-data.js has written the leans, so the choice cannot be
   made inside the odds run. `node scripts/update-data.js --of-day` runs this
   after the props refresh and before the feeds. The hourly run never chooses:
   it grades and republishes.

   State, all in data/picks-log.json (pipeline state, never loaded by the site):
   - a lean that is the play of the day keeps `potd: <day>` on its own entry;
   - a prop that is the play of the day or a parlay leg gets an entry of its
     own, `type: "prop"`, locked with its line, price and chance, graded here
     from ESPN's box score (scripts/props-log.js gradeEntries; free, no key);
   - the parlay is `type: "parlay"` as before, its legs by id;
   - `type: "day"` is one small marker a day: when the choice was last looked
     at and whether the locking run has happened (the page tells "front-runner
     so far" from "nothing qualified today" by it).
   Everything here that reads the log treats an entry with no type as a lean.
   ========================================================================== */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const P = require("../js/plays.js");
const PL = require("./props-log.js");

function round(n, d) { const m = Math.pow(10, d == null ? 4 : d); return Math.round(n * m) / m; }
function readWindow(file, name) {
  if (!fs.existsSync(file)) return null;
  try { const sb = { window: {} }; vm.runInNewContext(fs.readFileSync(file, "utf8"), sb); return sb.window[name] || null; } catch (err) { return null; }
}
function readProps(dataDir) { return readWindow(path.join(dataDir, "props.js"), "PROPS_DATA"); }
function readPicks(dataDir) { return readWindow(path.join(dataDir, "picks.js"), "PICKS_DATA"); }
function readJson(file) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (err) { return null; } }

/* ---------- the day's state in the log ---------- */
function isPlay(e) { return !!e && (!e.type || e.type === "prop"); }
function stateOf(log, day) {
  return { play: log.find(e => isPlay(e) && e.potd === day) || null, parlay: log.find(e => e.type === "parlay" && e.date === day) || null, day: log.find(e => e.type === "day" && e.date === day) || null };
}
function markDay(log, day) {
  let d = log.find(e => e.type === "day" && e.date === day);
  if (!d) { d = { type: "day", id: "day-" + day, date: day, checkedAt: null, closedAt: null }; log.push(d); }
  return d;
}

/* ---------- locking ---------- */
/* a prop as the log holds it: everything the page shows and the grade needs, as it stood when it locked */
function propEntry(x, day, now, check) {
  const c = check && (check[x.league] || check.all);
  return { type: "prop", id: x.id, date: day, sport: x.sport, league: x.league, sportKey: x.sportKey, event: x.event, home: x.home, away: x.away, gameId: x.gameId, commence: x.commence,
    pick: x.pick, market: x.market, player: x.player, stat: x.stat, statLabel: x.statLabel, statShort: x.statShort, side: x.side, line: x.line,
    prob: x.prob, stated: x.stated, keep: round(P.keepFor(x.league, check), 4), checkedOn: c ? c.n : 0, tier: x.tier, odds: x.odds, book: x.book, prices: x.prices, ev: x.ev,
    reasons: x.reasons || [], l10: x.l10 || null, proj: x.proj == null ? null : x.proj, linesAt: x.linesAt || null,
    status: "pending", actual: null, result: null, units: 0, lockedAt: now.toISOString() };
}
/* the log's entry for a play: a lean's own entry, or a prop's (made on its first use, then shared by the play and the parlay) */
function entryFor(log, x, day, now, check) {
  let e = log.find(o => isPlay(o) && o.id === x.id);
  if (!e && x.kind === "prop") { e = propEntry(x, day, now, check); log.push(e); }
  return e || null;
}

/* Looks at today's plays and locks what is due. deps: { etDate, boardOf, publicPick } from scripts/update-data.js (passed
   in: that file requires this one). opts.slot: the run's slot. Returns what it found and did. */
function choose(log, propsData, now, deps, opts) {
  opts = opts || {};
  const day = deps.etDate(now), t = now.getTime(), iso = now.toISOString();
  /* is this the run the day locks on? The afternoon run always; a manual run once the lock time has passed; the morning
     run never, however late it starts: it reads no NBA lines */
  const final = opts.slot === "afternoon" || (opts.slot !== "morning" && t >= P.lockAt(day));
  const st = stateOf(log, day), used = {};
  log.forEach(e => { if (isPlay(e) && e.potd && e.potd !== day) used[e.id] = true; }); /* an earlier day's play is never chosen again */
  const props = propsData && !propsData.sample && Array.isArray(propsData.players) ? propsData : null, check = P.checkOf(props);
  const board = deps.boardOf(log, now).map(e => deps.publicPick(e, now));
  const plays = P.all({ picks: board }, props, t).filter(x => x.day === day);
  const out = { date: day, final: final, candidates: plays.length, leans: plays.filter(x => x.kind === "lean").length, props: plays.filter(x => x.kind === "prop").length,
    play: st.play ? st.play.pick : null, playLocked: false, parlay: st.parlay ? st.parlay.legs.length : 0, parlayLocked: false };
  if (!st.play) {
    const top = P.top(plays, day, used);
    if (top && (final || P.startsEarly(top, day))) {
      const e = entryFor(log, top, day, now, check);
      if (e) { e.potd = day; e.potdAt = iso; out.play = e.pick; out.playLocked = true; }
    }
  }
  if (!st.parlay) {
    const par = P.parlay(plays, day);
    if (par && (final || par.legs.some(l => P.startsEarly(l, day)))) {
      const legs = par.legs.map(l => entryFor(log, l, day, now, check));
      if (legs.every(Boolean)) {
        log.push({ type: "parlay", id: "parlay-" + day, date: day, status: "pending", units: 0, loggedAt: iso, book: par.book, legs: legs.map(l => l.id), legPrices: par.legPrices, decimal: par.decimal, odds: par.odds, fairProb: par.fairProb, ev: par.ev });
        out.parlay = legs.length; out.parlayLocked = true;
      }
    }
  }
  const d = markDay(log, day);
  d.checkedAt = iso; d.candidates = out.candidates; d.leans = out.leans; d.props = out.props;
  if (final && !d.closedAt) d.closedAt = iso;
  return out;
}

/* ---------- grading the props held here ---------- */
/* deps: { profitPerUnit }. opts: { source (box scores; scripts/props-log.js liveSource by default), nflCache }.
   Win pays the locked price on one unit, Loss -1, Push 0; a player who did not play voids it, as a called-off game voids
   a lean. Returns { graded, voided, waiting, requests } */
async function gradeProps(log, now, deps, opts) {
  opts = opts || {};
  const out = { graded: 0, voided: 0, waiting: 0, requests: 0 };
  const pend = log.filter(e => e.type === "prop" && e.status === "pending" && e.commence);
  if (!pend.length) return out;
  const wraps = pend.map(e => ({ league: e.league, gameId: e.gameId, playerId: e.player && e.player.id, teamId: e.player && e.player.teamId, stat: e.stat, side: e.side, line: e.line, start: e.commence, ref: e }));
  const r = await PL.gradeEntries(wraps, now, { source: opts.source, nflCache: opts.nflCache });
  r.settled.forEach(function (w) {
    const e = w.ref; e.actual = w.actual; e.gradedAt = now.toISOString();
    if (w.result === "Void") { e.status = "void"; e.voidReason = "did not play"; out.voided++; return; }
    e.status = "graded"; e.result = w.result; out.graded++;
    e.units = w.result === "Win" ? round(deps.profitPerUnit(e.odds), 2) : w.result === "Loss" ? -1 : 0;
  });
  r.old.forEach(function (w) { w.ref.status = "void"; w.ref.voidReason = "no box score"; w.ref.gradedAt = now.toISOString(); out.voided++; });
  out.waiting = r.waiting; out.requests = r.requests;
  return out;
}

/* ---------- what picks.js publishes ---------- */
/* a locked prop in the shape the site's lean cards read (id, sport, event, home, away, commence, pick, odds, book, prices,
   modelProb, ev, confidence, status, started, result, units), plus what only a prop has */
function publicProp(e, now, deps) {
  const graded = e.status === "graded";
  return { kind: "prop", id: e.id, sport: e.sport, league: e.league, sportKey: e.sportKey || null, event: e.event, home: e.home, away: e.away, gameId: e.gameId,
    commence: e.commence, start: deps.startLabel(new Date(e.commence), now), market: e.market, pick: e.pick, odds: e.odds, book: e.book, prices: e.prices || {}, pricesAt: e.linesAt || e.lockedAt || null,
    modelProb: e.prob, statedProb: e.stated, keep: e.keep == null ? null : e.keep, checkedOn: e.checkedOn || 0, ev: e.ev, confidence: e.tier, basis: "game",
    player: e.player || null, stat: e.stat, statLabel: e.statLabel, statShort: e.statShort, side: e.side, line: e.line, l10: e.l10 || null, proj: e.proj == null ? null : e.proj, reasons: e.reasons || [],
    status: e.status || "pending", started: Date.parse(e.commence) <= now.getTime(), result: graded && e.result ? e.result : null, units: graded && typeof e.units === "number" ? e.units : null,
    actual: e.actual == null ? null : e.actual, voidReason: e.voidReason || null, score: null, loggedAt: e.lockedAt || null, lockedAt: e.lockedAt || null };
}
function publicPlay(e, now, deps) {
  if (!e) return null;
  if (e.type === "prop") return publicProp(e, now, deps);
  return Object.assign(deps.publicPick(e, now), { kind: "lean", lockedAt: e.potdAt || e.loggedAt || null });
}
/* the parlay of the day as the site sees it; `units` is its profit once graded. A leg says what kind of play it is and
   when it starts; a prop leg carries its player and line, since no other file on the page holds them */
function publicParlay(p, log, now) {
  if (!p) return null;
  const byId = {}; log.forEach(e => { if (isPlay(e)) byId[e.id] = e; });
  return { id: p.id, date: p.date, book: p.book, odds: p.odds, decimal: p.decimal, fairProb: p.fairProb, ev: p.ev, status: p.status, result: p.result || null, units: p.status === "graded" && typeof p.units === "number" ? p.units : null, lockedAt: p.loggedAt || null,
    legs: p.legs.map(function (id, i) {
      const l = byId[id] || {}, prop = l.type === "prop";
      const leg = { id: id, kind: prop ? "prop" : "lean", pick: l.pick, event: l.event, sport: l.sport, price: p.legPrices[i], commence: l.commence || null, started: Date.parse(l.commence) <= now.getTime(), result: l.result || null, void: l.status === "void" };
      if (prop) Object.assign(leg, { league: l.league, sportKey: l.sportKey || null, home: l.home, away: l.away, gameId: l.gameId, player: l.player || null, stat: l.stat, statShort: l.statShort, side: l.side, line: l.line, modelProb: l.prob, actual: l.actual == null ? null : l.actual });
      return leg;
    }) };
}
/* the last play and parlay of an earlier day, for the home page's "last time" line */
function lastOf(log, day) {
  const before = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
  const play = log.filter(e => isPlay(e) && e.potd && e.potd < day).sort((a, b) => (a.potd < b.potd ? 1 : a.potd > b.potd ? -1 : 0))[0] || null;
  const parlay = log.filter(e => e.type === "parlay" && e.date < day).sort(before)[0] || null;
  return {
    play: play ? { date: play.potd, kind: play.type === "prop" ? "prop" : "lean", sport: play.sport, event: play.event, pick: play.pick, odds: play.odds, status: play.status || "pending", result: play.status === "graded" ? play.result || null : null, units: play.status === "graded" && typeof play.units === "number" ? play.units : null } : null,
    parlay: parlay ? { date: parlay.date, legs: parlay.legs.length, odds: parlay.odds, status: parlay.status, result: parlay.result || null, units: parlay.status === "graded" && typeof parlay.units === "number" ? parlay.units : null } : null
  };
}
/* what picks.js carries about the day: { playOfDay, parlayOfDay, ofDay }. playOfDay stays null until the play locks;
   until then the page shows its own front-runner (the first of its ranked list) and says it is not final.
   ofDay: { date, lockAt (ISO), playLocked, parlayLocked, closed (the locking run has happened), checkedAt, last } */
function publish(log, now, deps) {
  const day = deps.etDate(now), st = stateOf(log, day);
  return {
    playOfDay: publicPlay(st.play, now, deps),
    parlayOfDay: publicParlay(st.parlay, log, now),
    ofDay: { date: day, lockAt: new Date(P.lockAt(day)).toISOString(), playLocked: !!st.play, parlayLocked: !!st.parlay, closed: !!(st.day && st.day.closedAt), checkedAt: st.day ? st.day.checkedAt : null, last: lastOf(log, day) }
  };
}

module.exports = { choose, gradeProps, publish, publicPlay, publicProp, publicParlay, lastOf, stateOf, isPlay, propEntry, readProps, readPicks, readJson };
