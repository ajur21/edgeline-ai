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

  /* an hour after the NBA tip: picks.js keeps the started picks on the card (status pending, started), so the feeds must
     write them in play under the same UID and guid, once each, while the soccer picks are still ahead */
  const uids = ics => (ics.replace(/\r\n /g, "").match(/^UID:.*$/gm) || []);
  const guids = rss => (rss.match(/<guid isPermaLink="false">[^<]*<\/guid>/g) || []);
  const unique = list => new Set(list).size === list.length;
  const vevents = ics => ics.replace(/\r\n /g, "").split("BEGIN:VEVENT").slice(1);
  const itemOf = (rss, guid) => (rss.split("<item>").find(s => s.indexOf('<guid isPermaLink="false">' + guid + "</guid>") !== -1) || "");
  await P.run({ fixture: true, out: tmp, now: "2026-11-06T01:00:00Z", track: true });
  const c = F.build({ data: tmp, base: "https://example.test/site" });
  const cflat = c.ics.replace(/\r\n /g, "");
  const nbaIds = ["nba-fix-1-h2h-Boston-Celtics", "nba-fix-1-spreads-Boston-Celtics", "nba-fix-1-totals-Under"];
  check("in play: the started NBA picks keep their UID and read in play, with no alarm; the soccer picks are still upcoming", c.events === 6 && nbaIds.every(id => vevents(c.ics).some(v => v.indexOf("UID:" + id + "@edgeline") !== -1 && / · in play\r?\n/.test(v) && v.indexOf("VALARM") === -1)) && /SUMMARY:Boston Celtics ML -145 at Caesars · in play/.test(cflat) && vevents(c.ics).filter(v => /UID:epl-fix-1/.test(v)).every(v => v.indexOf("TRIGGER:-PT30M") !== -1 && v.indexOf("in play") === -1), JSON.stringify(uids(c.ics)));
  check("in play: one event per pick and one item per pick, no duplicates (calendar UIDs and feed guids unique)", unique(uids(c.ics)) && uids(c.ics).length === 6 && unique(guids(c.rss)) && c.items === 7, JSON.stringify(guids(c.rss)));
  check("in play: the feed keeps each pick's item under the same guid and date, marked in play", nbaIds.every(id => / · in play<\/title>/.test(itemOf(c.rss, id))) && itemOf(c.rss, "nba-fix-1-h2h-Boston-Celtics").match(/<pubDate>[^<]*<\/pubDate>/)[0] === itemOf(a.rss, "nba-fix-1-h2h-Boston-Celtics").match(/<pubDate>[^<]*<\/pubDate>/)[0] && !/ · in play/.test(itemOf(c.rss, "epl-fix-1-h2h-Arsenal")));
  check("in play: the slate still counts the night's five picks (a pick night never reads no play at tip-off)", !c.noPlay && /5 picks tonight from 11 priced sides/.test(c.rss) && !/VALUE=DATE/.test(c.ics));

  /* later that night, hand-written: picks.js holds one pick ahead, one in play, two graded (one also in the log, which
     carries its close and CLV; one only in picks.js, with its score as { home, away }) and a void one; the log also holds
     an older graded pick that has left the card */
  const night = fs.mkdtempSync(path.join(os.tmpdir(), "edgeline-feeds-night-"));
  const card = (id, extra) => Object.assign({ id: id, sport: "NBA", event: "Away " + id + " @ Home " + id, market: "Moneyline", pick: "Home " + id + " ML", odds: 140, book: "Caesars", modelProb: 0.48, confidence: "Medium", loggedAt: "2026-11-05T21:30:00.000Z", prices: { Caesars: 140, FanDuel: 130 } }, extra);
  fs.writeFileSync(path.join(night, "picks.js"), "window.PICKS_DATA = " + JSON.stringify({ sample: false, generatedAt: "2026-11-05T21:30:00.000Z", trackedAt: "2026-11-06T03:00:00.000Z", playOfDay: null, parlayOfDay: null, picks: [
    card("up1", { commence: "2026-11-06T03:30:00Z", status: "pending", started: false, result: null, units: null, score: null }),
    card("play1", { commence: "2026-11-06T02:00:00Z", status: "pending", started: true, result: null, units: null, score: null }),
    card("won1", { commence: "2026-11-06T00:00:00Z", status: "graded", started: true, result: "Win", units: 1.4, score: { home: 110, away: 104 } }),
    card("lost1", { commence: "2026-11-06T00:30:00Z", status: "graded", started: true, result: "Loss", units: -1, score: { home: 104, away: 98 } }),
    card("void1", { commence: "2026-11-06T01:00:00Z", status: "void", started: true, result: null, units: null, score: null })
  ] }) + ";");
  fs.writeFileSync(path.join(night, "market.js"), "window.MARKET_DATA = " + JSON.stringify({ sample: false, generatedAt: "2026-11-05T21:30:00.000Z", threshold: 0.03, games: 2, rows: [
    { eventId: "e1", sport: "NBA", event: "A @ B", marketKey: "h2h", market: "Moneyline", pick: "B ML", odds: 140, book: "Caesars", edge: 0.05, status: "pick", prices: { Caesars: 140 } },
    { eventId: "e2", sport: "NBA", event: "C @ D", marketKey: "totals", market: "Total", pick: "Under 220.5", odds: -105, book: "DraftKings", edge: 0.01, status: "none", prices: { DraftKings: -105 } }
  ] }) + ";");
  fs.writeFileSync(path.join(night, "picks-log.json"), JSON.stringify([
    card("won1", { commence: "2026-11-06T00:00:00Z", status: "graded", result: "Win", units: 1.4, score: "104-110", gradedAt: "2026-11-06T02:45:00.000Z", clv: 0.021, close: { odds: 120, source: "DraftKings close (ESPN)" } }),
    card("play1", { commence: "2026-11-06T02:00:00Z", status: "pending", units: 0 }),
    card("void1", { commence: "2026-11-06T01:00:00Z", status: "void", units: 0 }),
    card("up1", { commence: "2026-11-06T03:30:00Z", status: "pending", units: 0 }),
    card("older", { commence: "2026-11-04T00:00:00Z", status: "graded", result: "Loss", units: -1, score: "99-101", gradedAt: "2026-11-04T03:10:00.000Z" })
  ]));
  const n = F.build({ data: night, base: "https://example.test/" });
  const nflat = n.ics.replace(/\r\n /g, "");
  check("graded night: one calendar event per pick under its own UID: ahead with its alarm, in play, won, lost; the void pick left out", unique(uids(n.ics)) && uids(n.ics).length === 5 && /SUMMARY:Home up1 ML \+140 at Caesars · Medium/.test(nflat) && /SUMMARY:Home play1 ML \+140 at Caesars · in play/.test(nflat) && /SUMMARY:Home won1 ML \+140 at Caesars · Won \+1\.40u/.test(nflat) && /SUMMARY:Home lost1 ML \+140 at Caesars · Lost -1\.00u/.test(nflat) && /SUMMARY:Home older ML \+140 at Caesars · Lost -1\.00u/.test(nflat) && !/void1/.test(nflat) && (nflat.match(/BEGIN:VALARM/g) || []).length === 1, JSON.stringify(uids(n.ics)));
  check("graded night: the grade reads from the log when it has the pick (CLV and close), and from picks.js' { home, away } when it does not", /Closing line value: \+2\.1 pts \(closed \+120\\, DraftKings close \(ESPN\)\)/.test(vevents(n.ics).find(v => /UID:won1@/.test(v)) || "") && /Final: 104-110/.test(vevents(n.ics).find(v => /UID:won1@/.test(v)) || "") && /Final: 98-104/.test(vevents(n.ics).find(v => /UID:lost1@/.test(v)) || ""));
  check("graded night: the feed has the pick ahead and the one in play under their own guids, a new #graded item for each grade in place of the pick's item, and no duplicates", unique(guids(n.rss)) && n.items === 6 && /<guid isPermaLink="false">up1<\/guid>/.test(n.rss) && / · in play<\/title>/.test(itemOf(n.rss, "play1")) && /Graded: Home won1 ML \+140 · Won \+1\.40u/.test(n.rss) && /Graded: Home lost1 ML \+140 · Lost -1\.00u/.test(n.rss) && /<guid isPermaLink="false">older#graded<\/guid>/.test(n.rss) && !/<guid isPermaLink="false">(won1|lost1)<\/guid>/.test(n.rss) && !/void1/.test(n.rss), JSON.stringify(guids(n.rss)));
  check("graded night: the slate counts the night's four live picks, not the void one, and never reads no play", !n.noPlay && /4 picks tonight from 2 priced sides/.test(n.rss));
  check("graded night: output is deterministic", F.build({ data: night, base: "https://example.test/" }).ics === n.ics && F.build({ data: night, base: "https://example.test/" }).rss === n.rss);

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
