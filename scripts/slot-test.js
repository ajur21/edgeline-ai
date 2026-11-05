/* Offline checks for scripts/slot-due.js: when a full run that fills a daily slot is still due (run by `npm test`) */
const S = require("./slot-due.js");
let fails = 0;
function check(name, ok, info) { console.log((ok ? "PASS " : "FAIL ") + name + (info ? "  " + info : "")); if (!ok) fails++; }
const T = s => Date.parse(s);

check("slot: a cron line and a slot name give the slot's time; a manual run has none", JSON.stringify(S.slotTime("0 17 * * *")) === "[17,0]" && JSON.stringify(S.slotTime("30 20 * * *")) === "[20,30]" && JSON.stringify(S.slotTime("", "noon")) === "[17,0]" && JSON.stringify(S.slotTime("", "afternoon")) === "[20,30]" && S.slotTime("", "manual") === null && S.slotTime("", "") === null);
check("slot: a manual run always runs, however fresh the data", S.due({ slot: "manual", now: T("2026-11-05T17:01:00Z"), generatedAt: "2026-11-05T17:00:30Z" }).run === true);
check("slot: the routine's noon dispatch runs when the last full run was the morning's (2026-11-05: 15:47)", S.due({ slot: "noon", now: T("2026-11-05T17:00:20Z"), generatedAt: "2026-11-05T15:47:22.894Z" }).run === true);
check("slot: GitHub's noon run, five hours late, skips once the routine's run has written the data", (r => r.run === false && /already covered the 17:00 UTC slot of 2026-11-05/.test(r.why))(S.due({ cron: "0 17 * * *", now: T("2026-11-05T22:15:51Z"), generatedAt: "2026-11-05T17:01:10Z" })));
check("slot: GitHub's noon run still runs when the routine's run never happened (the fallback)", S.due({ cron: "0 17 * * *", now: T("2026-11-05T22:15:51Z"), generatedAt: "2026-11-05T15:47:22.894Z" }).run === true);
check("slot: a 20:30 run landing after midnight UTC belongs to the day before", (r => r.run === false && /20:30 UTC slot of 2026-11-05/.test(r.why))(S.due({ cron: "30 20 * * *", now: T("2026-11-06T00:59:19Z"), generatedAt: "2026-11-05T20:30:40Z" })) && S.due({ cron: "30 20 * * *", now: T("2026-11-06T00:59:19Z"), generatedAt: "2026-11-05T17:01:10Z" }).run === true);
check("slot: a routine firing a little early still fills today's slot, not yesterday's", S.due({ slot: "noon", now: T("2026-11-05T16:58:00Z"), generatedAt: "2026-11-05T15:47:22.894Z" }).run === true && S.due({ slot: "afternoon", now: T("2026-11-05T20:29:00Z"), generatedAt: "2026-11-05T17:01:10Z" }).run === true);
check("slot: a noon run that itself ran late, past 20:30, covers the afternoon slot too (no second run minutes later)", S.due({ slot: "afternoon", now: T("2026-11-05T20:50:00Z"), generatedAt: "2026-11-05T20:45:00Z" }).run === false);
check("slot: no readable data file means the slot is due", S.due({ cron: "0 17 * * *", now: T("2026-11-05T17:05:00Z"), generatedAt: null }).run === true && S.generatedAtOf("/nonexistent/picks.js") === null);
check("slot: generatedAt is read from data/picks.js", typeof S.generatedAtOf(require("path").join(__dirname, "..", "data", "picks.js")) === "string");

console.log(fails ? "FAILURES: " + fails : "ALL PASS");
process.exit(fails ? 1 : 0);
