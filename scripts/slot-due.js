/* Is this full run still due? (2026-11-05)

   The two daily full runs (14:00 and 20:30 UTC; the first was 17:00 until 2026-11-05, moved earlier to catch prices
   nearer the open) are started on time by two Claude routines that dispatch update-data.yml with slot=morning /
   slot=afternoon. GitHub's own schedule stays in the workflow as the fallback, but it
   fires hours late on this repo (on 2026-11-04 the 17:00 run started at 22:15, the 20:30 one at 00:59), and a late
   duplicate would spend The Odds API's credits twice. So a run that fills a slot (a scheduled run, or a dispatch that
   names its slot) is skipped when a full run has already written data/picks.js since that slot's time today; a manual
   run (no slot) always runs. A slot's time is today's in UTC, or yesterday's when today's is still more than 30 minutes
   ahead (a late 20:30 run lands after midnight; a routine may fire a little early).

   CLI (the workflow's gate job): SLOT_CRON (github.event.schedule) and SLOT (the dispatch input) from the environment;
   prints why, and writes run=true|false to $GITHUB_OUTPUT. */
const SLOTS = { morning: [14, 0], afternoon: [20, 30] };
const EARLY_MS = 30 * 60 * 1000, DAY_MS = 24 * 60 * 60 * 1000;

/* [hour, minute] for a cron line ("30 20 * * *") or a slot name; null for a manual run */
function slotTime(cron, slot) {
  if (cron) { const f = String(cron).trim().split(/\s+/), m = Number(f[0]), h = Number(f[1]); return Number.isInteger(h) && Number.isInteger(m) ? [h, m] : null; }
  return SLOTS[slot] || null;
}
/* { run, why } given the slot, the time now (ms) and data/picks.js's generatedAt (ISO string or null) */
function due(o) {
  const hm = slotTime(o.cron, o.slot), now = o.now;
  if (!hm) return { run: true, why: "manual run: no slot, always runs" };
  const d = new Date(now), today = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hm[0], hm[1]);
  const at = today - now > EARLY_MS ? today - DAY_MS : today;
  const gen = Date.parse(o.generatedAt || "");
  const label = String(hm[0]).padStart(2, "0") + ":" + String(hm[1]).padStart(2, "0") + " UTC slot of " + new Date(at).toISOString().slice(0, 10);
  if (Number.isFinite(gen) && gen >= at) return { run: false, why: "skip: a full run at " + new Date(gen).toISOString() + " already covered the " + label };
  return { run: true, why: "due: no full run since the " + label + (Number.isFinite(gen) ? " (last at " + new Date(gen).toISOString() + ")" : "") };
}
function generatedAtOf(file) {
  try {
    const fs = require("fs"), vm = require("vm"), sb = { window: {} };
    vm.runInNewContext(fs.readFileSync(file, "utf8"), sb);
    return (sb.window.PICKS_DATA && sb.window.PICKS_DATA.generatedAt) || null;
  } catch (e) { return null; }
}

if (require.main === module) {
  const path = require("path");
  const r = due({ cron: process.env.SLOT_CRON || "", slot: process.env.SLOT || "", now: Date.now(), generatedAt: generatedAtOf(path.join(__dirname, "..", "data", "picks.js")) });
  console.log(r.why);
  if (process.env.GITHUB_OUTPUT) require("fs").appendFileSync(process.env.GITHUB_OUTPUT, "run=" + r.run + "\n");
}
module.exports = { due, slotTime, generatedAtOf, SLOTS };
