/* Offline test of the pick feeds (calendar + RSS) against the pipeline fixtures. Run: node scripts/feeds-test.js */
"use strict";
const fs = require("fs"), path = require("path"), os = require("os");
const P = require("./update-data.js");
const F = require("./feeds.js");
const fails = [];
const check = (name, ok, extra) => { console.log((ok ? "PASS " : "FAIL ") + name + (extra ? "  " + extra : "")); if (!ok) fails.push(name); };
const longest = s => s.split("\r\n").reduce((m, l) => Math.max(m, Buffer.byteLength(l, "utf8")), 0);

(async () => {
  /* escaping and folding */
  check("ics escapes commas, semicolons, backslashes and newlines", F.icsText("a, b; c\\d\ne") === "a\\, b\\; c\\\\d\\ne");
  check("xml escapes the five characters", F.xml("<a & \"b\">") === "&lt;a &amp; &quot;b&quot;&gt;");
  const folded = F.fold("SUMMARY:" + "x".repeat(200));
  check("ics folds long lines at 75 octets", folded.split("\r\n").every(l => Buffer.byteLength(l) <= 75) && folded.replace(/\r\n /g, "").length === 208);
  check("ics folding counts multi-byte characters by octet", F.fold("S:" + "é".repeat(100)).split("\r\n").every(l => Buffer.byteLength(l) <= 75));
  check("html turns dash lines into a list", F.html(["Lead", "- one", "- two", "Tail"]) === "<p>Lead</p><ul><li>one</li><li>two</li></ul><p>Tail</p>");
  check("ET date and label", F.etDate("2026-11-06T00:10:00Z") === "2026-11-05" && F.etLabel("2026-11-06T00:10:00Z") === "Thu Nov 5, 7:10 PM ET");

  /* a pick night: the fixture pipeline output */
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "edgeline-feeds-"));
  await P.run({ fixture: true, out: tmp, now: "2026-11-05T15:00:00Z" });
  const a = F.build({ data: tmp, base: "https://example.test/site" });
  check("pick night: one event per board pick plus the parlay of the day (six on the fixture), no all-day slate", a.events === 6 && !a.noPlay && !/VALUE=DATE/.test(a.ics));
  check("pick night: calendar is well-formed", /^BEGIN:VCALENDAR\r\n/.test(a.ics) && /\r\nEND:VCALENDAR\r\n$/.test(a.ics) && longest(a.ics) <= 75);
  check("pick night: event carries uid, start, alarm and the play-of-the-day label", /UID:nba-fix-1-h2h-Boston-Celtics@edgeline/.test(a.ics) && /DTSTART:20261106T000000Z/.test(a.ics) && /TRIGGER:-PT30M/.test(a.ics) && /SUMMARY:Boston Celtics ML -145 at Caesars · High/.test(a.ics) && /SUMMARY:Play of the day: Under 226\.5 -110 at DraftKings/.test(a.ics) && /Our probability 74\.9% from game data/.test(a.ics.replace(/\r\n /g, "")));
  check("pick night: base url is normalised with a trailing slash", /URL:https:\/\/example\.test\/site\/picks\.html#nba-fix-1/.test(a.ics.replace(/\r\n /g, "")));
  check("pick night: feed has the pick item and the slate item, newest first", (a.rss.match(/<item>/g) || []).length === 7 && /<guid isPermaLink="false">nba-fix-1-h2h-Boston-Celtics<\/guid>/.test(a.rss) && /5 picks tonight from 11 priced sides/.test(a.rss) && a.rss.indexOf("slate-2026") < a.rss.indexOf("nba-fix-1"));
  check("pick night: feed escapes markup in descriptions", /&lt;ul&gt;&lt;li&gt;/.test(a.rss) && !/<ul>/.test(a.rss));
  check("pick night: feed declares itself", /<atom:link href="https:\/\/example\.test\/site\/feed\.xml" rel="self"/.test(a.rss) && /<lastBuildDate>/.test(a.rss));

  /* a no-play night with a graded history: hand-written data files */
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "edgeline-feeds-empty-"));
  fs.writeFileSync(path.join(empty, "picks.js"), "window.PICKS_DATA = " + JSON.stringify({ sample: false, generatedAt: "2026-11-04T18:46:21Z", playOfDay: null, parlayOfDay: null, picks: [] }) + ";");
  fs.writeFileSync(path.join(empty, "market.js"), "window.MARKET_DATA = " + JSON.stringify({ sample: false, generatedAt: "2026-11-04T18:46:21Z", threshold: 0.01, watch: 0.005, games: 2, rows: [
    { eventId: "e1", sport: "NHL", event: "A @ B", marketKey: "spreads", market: "Puck line", pick: "B -1.5", odds: 140, book: "BetRivers", edge: 0.0051, status: "watch", prices: { BetRivers: 140 } },
    { eventId: "e1", sport: "NHL", event: "A @ B", marketKey: "spreads", market: "Puck line", pick: "A +1.5", odds: -170, book: "FanDuel", edge: -0.03, status: "none", prices: { FanDuel: -170 } },
    { eventId: "e2", sport: "NBA", event: "C @ D", marketKey: "totals", market: "Total", pick: "Under 220.5", odds: -105, book: "DraftKings", edge: 0.002, status: "none", prices: { DraftKings: -105 } }
  ] }) + ";");
  fs.writeFileSync(path.join(empty, "picks-log.json"), JSON.stringify([
    { id: "old-win", sport: "NBA", event: "X @ Y", market: "Moneyline", pick: "Y ML", odds: 140, book: "Caesars", commence: "2026-11-02T00:00:00Z", status: "graded", result: "Win", units: 1.4, gradedAt: "2026-11-02T05:00:00Z", clv: 0.021, close: { odds: 120, source: "DraftKings close (ESPN)" }, modelProb: 0.45 },
    { id: "old-void", sport: "NBA", event: "X @ Y", market: "Total", pick: "Over 1", odds: -110, book: "FanDuel", commence: "2026-11-01T00:00:00Z", status: "void", modelProb: 0.5 },
    { id: "ancient", sport: "NFL", event: "P @ Q", market: "Spread", pick: "Q -3", odds: -110, book: "BetMGM", commence: "2026-09-01T00:00:00Z", status: "graded", result: "Loss", units: -1, modelProb: 0.55 },
    { id: "parlay-2026-11-02", type: "parlay", status: "graded", result: "Loss", units: -1 }
  ]));
  const b = F.build({ data: empty, base: "https://example.test/" });
  const flat = b.ics.replace(/\r\n /g, "");
  check("no-play night: all-day slate event plus the graded pick; void and 30-day-old entries left out", b.noPlay && b.events === 2 && /DTSTART;VALUE=DATE:20261104/.test(flat) && /UID:old-win@edgeline/.test(flat) && !/old-void/.test(flat) && !/ancient/.test(flat));
  check("no-play night: slate names the count, the bar and the closest side", /SUMMARY:No play tonight: 3 sides priced in 2 games\\, none clears the 1-point bar/.test(flat) && /- NHL: B -1\.5 \+140 at BetRivers \(\+0\.5 pts\)/.test(flat));
  check("no-play night: the closest list shows one side per market", (flat.match(/- NHL: /g) || []).length === 1 && /- NBA: Under 220\.5/.test(flat));
  check("no-play night: the grade is written into the event", /SUMMARY:Y ML \+140 at Caesars · Won \+1\.40u/.test(flat) && /Closing line value: \+2\.1 pts \(closed \+120\\, DraftKings close \(ESPN\)\)/.test(flat));
  check("no-play night: feed has the slate and the grade", /slate: No play tonight/.test(b.rss) && /<guid isPermaLink="false">old-win#graded<\/guid>/.test(b.rss) && /Graded: Y ML \+140 · Won \+1\.40u/.test(b.rss));
  check("no-play night: the slate is the newest item", b.rss.indexOf("slate-2026") < b.rss.indexOf("old-win#graded"));

  /* deterministic: the same data writes the same bytes */
  check("output is deterministic", F.build({ data: empty, base: "https://example.test/" }).ics === b.ics && F.build({ data: empty, base: "https://example.test/" }).rss === b.rss);

  /* write() lands both files */
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "edgeline-feeds-out-"));
  F.write({ data: empty, out: outDir });
  check("write() creates picks.ics and feed.xml", fs.existsSync(path.join(outDir, "picks.ics")) && fs.existsSync(path.join(outDir, "feed.xml")));

  console.log(fails.length ? "FAILURES: " + fails.length : "ALL PASS");
  process.exit(fails.length ? 1 : 0);
})();
