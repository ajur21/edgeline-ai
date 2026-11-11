/* ==========================================================================
   EdgeLine AI — the surplus spenders (2026-11-08; the owner: "stay with the budget and max out the credits from both
   APIs"). Both price APIs stay on their free tiers; whatever a month's protected schedule will not need is spent on
   optional fetches, down to a small floor, never over, and paced so the end of the month still has credits.

   The Odds API (500 credits a month, reset on the 1st). The protected schedule is the merged slot rule (every afternoon
   run, the NHL's mornings, the NFL's morningDays, college football's Fridays, the morning guard). After a full run's
   protected fetches:
     spare = credits left − what the protected schedule still needs until the reset (every later run, counted from
             ESPN's real schedule through the pipeline's own slotAllows / runDayAllows / espnGames / fetchDecision, the
             way the budget simulations count) − the floor (10) − a cushion for the rare scores call (4)
   and while it covers the cost, optional fetches in this order: college football on a run with an FBS game inside the
   window that Friday's fetch does not cover (Tuesday to Thursday nights, a Friday afternoon kickoff, weekday bowls);
   the Premier League and MLS on a weekend morning run when a kickoff falls before the afternoon run; college football
   on Saturday morning for the noon kickoffs; La Liga is not offered (model.js has no La Liga model or calibration).
   Paced: a day spends at most about 2 × spare ÷ the days left to the reset (`dayCap`), counted in data/budget.json.

   SportsGameOdds (2,500 entities a cycle, the usage endpoint gives the count and, when it says so, the reset). The
   protected spend (board refreshes, props lines on the full runs) is read from the usage endpoint's own count between
   runs, net of what the spender spent; spare = entities left − that daily rate × the days left − the reserve (150, 50
   in the cycle's last five days). Spent on the hourly track runs, paced the same way, in this order: the track window
   widened from 8 to 12 hours (more pre-game points for the close's fallback); props lines refreshed for NBA and NFL
   games starting within three hours; college football board games refreshed (a second price source and a pre-game
   close; none while `HOLD.h2h` keeps college moneylines off the board).

   NFL lines before game day (2026-11-10, the owner: "NFL props depth"): the afternoon props run prices the next NFL
   slate one or two days ahead from the same spare, the same pace and the same state (`sgoEarly`; the call is made by
   scripts/nfl-props.js). Two days ahead gives way first: it is taken only while the spare also covers the day before.
   ========================================================================== */
"use strict";
const fs = require("fs");
const path = require("path");

const ODDS = { floor: 10, cushion: 4, pace: 2 };
const SGO = { reserve: 150, reserveLate: 50, lateDays: 5, pace: 2, dailyDefault: 36, baseHours: 8, wideHours: 12, propsHours: 3, earlyDays: 2 /* NFL lines: how many days before a game day */ };
const DAY = 864e5;

/* ---------- the calendar ---------- */
function utcDay(ms) { const d = new Date(ms); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); }
function monthKey(ms) { return new Date(ms).toISOString().slice(0, 7); }
function dateKey(ms) { return new Date(ms).toISOString().slice(0, 10); }
/* The Odds API resets on the 1st (its FAQ) */
function oddsResetMs(now) { const d = new Date(now); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); }
/* SportsGameOdds: the usage endpoint's reset when it gives one, else the 1st */
function sgoResetMs(now, usage) {
  const r = usage && (usage.resetsAt || usage.reset);
  const t = r != null ? (typeof r === "number" ? (r < 1e12 ? r * 1000 : r) : Date.parse(r)) : NaN;
  return Number.isFinite(t) && t > now ? t : oddsResetMs(now);
}
/* the days left to a reset, today included: Nov 8 -> Dec 1 is 23 */
function daysLeft(now, resetMs) { return Math.max(1, Math.round((utcDay(resetMs - 1) - utcDay(now)) / DAY) + 1); }
/* the most a day may spend from the surplus: about pace × spare ÷ the days left */
function dayCap(spare, days, pace) { return spare > 0 ? Math.floor((pace == null ? 2 : pace) * spare / Math.max(1, days)) : 0; }

/* ---------- The Odds API ---------- */
function oddsSpare(remaining, need, opts) {
  opts = Object.assign({}, ODDS, opts);
  return remaining == null || need == null ? null : remaining - need - opts.floor - opts.cushion;
}
/* candidates: [{ key, label, cost }] in priority order. Each is taken while its cost fits both the spare and what the day
   may still spend; one that does not fit is passed over (a cheaper one after it may still fit). Returns { take, skip } */
function choose(candidates, spare, dayRoom) {
  let left = spare == null ? 0 : spare, room = dayRoom == null ? 0 : dayRoom; const take = [], skip = [];
  (candidates || []).forEach(function (c) {
    if (spare == null) { skip.push(Object.assign({ why: "spare unknown" }, c)); return; }
    if (c.cost > left) { skip.push(Object.assign({ why: "spare " + left + " < " + c.cost }, c)); return; }
    if (c.cost > room) { skip.push(Object.assign({ why: "today's pace allows " + Math.max(0, room) }, c)); return; }
    take.push(c); left -= c.cost; room -= c.cost;
  });
  return { take: take, skip: skip, left: left, room: room };
}
/* the first FBS kickoff a Friday afternoon run (20:30 UTC, a 36-hour window) does not reach */
function fridayCovers(t, fridayRun) {
  const d = new Date(t);
  for (let back = 0; back < 7; back++) {
    const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back);
    if (new Date(day).getUTCDay() !== 5) continue;
    const run = day + (fridayRun[0] * 60 + fridayRun[1]) * 6e4;
    return t > run && t < run + 36 * 36e5;
  }
  return false;
}

/* ---------- SportsGameOdds ---------- */
/* the protected spend a day, from the usage endpoint's count between runs net of the surplus spent: the sample nearest a
   week back (a day at least); without one, the documented pace (about 1,050 a month) */
function sgoDailyRate(samples, used, surplusTotal, now, fallback) {
  const s = (samples || []).filter(x => x && now - Date.parse(x.at) >= DAY * 0.9).sort((a, b) => Math.abs(now - Date.parse(a.at) - 7 * DAY) - Math.abs(now - Date.parse(b.at) - 7 * DAY))[0];
  if (!s || used == null) return fallback == null ? SGO.dailyDefault : fallback;
  const days = (now - Date.parse(s.at)) / DAY, spent = (used - s.used) - ((surplusTotal || 0) - (s.surplus || 0));
  return spent >= 0 ? spent / days : (fallback == null ? SGO.dailyDefault : fallback);
}
function sgoReserve(days) { return days <= SGO.lateDays ? SGO.reserveLate : SGO.reserve; }
function sgoSpare(usage, rate, days) {
  if (!usage || !usage.max) return null;
  return Math.floor(usage.max - usage.used - rate * days - sgoReserve(days));
}

/* NFL lines before game day: may the props run spend `cost` entities (one per game of the next slate) now?
   The same arithmetic as the track run's spender, on the same cycle of data/budget.json: spare = entities left − the
   protected rate × the days left − the reserve; a day spends at most about 2 × spare ÷ the days left, counted with what
   the track runs spent today. Two days ahead must leave the day before its own call (2 × cost within the spare), so a
   short month prices the day before only, and nothing once the spare is under one slate.
   Returns { take, why, spare, rate, days, cap, room, reserve, cycle } (cycle: the state to record the spend in) */
function sgoEarly(state, usage, now, o) {
  const reset = sgoResetMs(now, usage), days = daysLeft(now, reset);
  const c = cycleOf(state, "sgo", new Date(reset).toISOString().slice(0, 10));
  const rate = sgoDailyRate(c.samples, usage && usage.used, c.total, now);
  const spare = sgoSpare(usage, rate, days), cap = dayCap(spare, days, SGO.pace), room = cap - spentToday(c, now);
  const ahead = o.daysAhead, need = ahead >= 2 ? 2 * o.cost : o.cost;
  let why = null;
  if (!(o.cost > 0)) why = "no game to price";
  else if (!(ahead >= 1 && ahead <= SGO.earlyDays)) why = "the slate is " + ahead + " days ahead (lines are read one or two days before)";
  else if (spare == null) why = "spare unknown";
  else if (need > spare) why = "spare " + spare + " < " + need + (ahead >= 2 ? " (two days ahead leaves the day before its " + o.cost + ")" : "");
  else if (o.cost > room) why = "today's pace allows " + Math.max(0, room);
  return { take: !why, why: why, spare: spare, rate: Math.round(rate * 10) / 10, days: days, cap: cap, room: room, reserve: sgoReserve(days), cycle: c };
}

/* ---------- state: data/budget.json (what the spenders spent each day; the usage samples) ---------- */
function readState(dataDir) {
  try { return JSON.parse(fs.readFileSync(path.join(dataDir, "budget.json"), "utf8")); } catch (e) { return {}; }
}
function writeState(dataDir, state) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, "budget.json"), JSON.stringify(state, null, 1) + "\n");
}
/* the part of the state for one API and one cycle (a new cycle starts empty) */
function cycleOf(state, api, cycle) {
  if (!state[api] || state[api].cycle !== cycle) state[api] = { cycle: cycle, days: {}, total: 0, samples: [] };
  return state[api];
}
function spentToday(c, now) { return (c.days[dateKey(now)] || 0); }
function addSpent(c, now, n) { if (!n) return; const k = dateKey(now); c.days[k] = (c.days[k] || 0) + n; c.total = (c.total || 0) + n; }

module.exports = { ODDS, SGO, oddsResetMs, sgoResetMs, daysLeft, dayCap, oddsSpare, choose, fridayCovers, sgoDailyRate, sgoReserve, sgoSpare, sgoEarly, readState, writeState, cycleOf, spentToday, addSpent, monthKey, dateKey };
