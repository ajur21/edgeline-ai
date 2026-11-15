/* Behaviour checks for early lines on picks.html (js/early.js, 2026-11-15). Run by scripts/behavior.js (npm test) with
   its server, clock and check(). The suite's own server serves no early lines (every other check sees the page as it
   was); each page here routes data/early-line.js itself, with an EARLY_DATA built below in the pipeline's shape
   (scripts/early-line.js publicData) around the suite's clock, Wed 2026-11-04 4:45 PM ET. ESPN is answered from here. */
async function run(h) {
  const { browser, url, check, pinClock, FIXTURE_NOW } = h;
  const H = 36e5, iso = t => new Date(t).toISOString();
  const team = (id, abbr, name) => ({ id: id, abbr: abbr, name: name });
  const BUF = team("2", "BUF", "Buffalo Bills"), MIA = team("15", "MIA", "Miami Dolphins"), KC = team("12", "KC", "Kansas City Chiefs"), ARI = team("22", "ARI", "Arizona Cardinals");
  const OSU = team("194", "OSU", "Ohio State Buckeyes"), MICH = team("130", "MICH", "Michigan Wolverines"), DAL = team("6", "DAL", "Dallas Cowboys"), TEN = team("10", "TEN", "Tennessee Titans");
  function game(id, league, at, home, away, side, prob, odds, o) {
    o = o || {};
    const imp = odds > 0 ? 100 / (odds + 100) : -odds / (-odds + 100), edge = Math.round((prob - imp) * 1e4) / 1e4, bar = o.bar != null ? o.bar : 0.06;
    return Object.assign({ league: league, id: id, commence: iso(at), date: "", home: home, away: away, at: iso(FIXTURE_NOW - 30 * H), hoursBefore: 60, side: side, team: (side === "home" ? home : away).name,
      prob: prob, odds: odds, fair: imp - 0.02, edge: edge, bar: bar, past: Math.round((edge - bar) * 1e4) / 1e4, clears: edge - bar >= 0, now: null, status: "pending", result: null, score: null, units: null, clv: null, move: null, closeOdds: null }, o.more || {});
  }
  const THU = Date.parse("2026-11-05T20:15:00-05:00"), SAT = Date.parse("2026-11-07T12:00:00-05:00"), SUN = Date.parse("2026-11-08T13:00:00-05:00"), MON = Date.parse("2026-11-02T20:15:00-05:00"), TODAY = Date.parse("2026-11-04T13:00:00-05:00");
  const sample = () => ({
    sample: false, generatedAt: iso(FIXTURE_NOW - H), since: { at: iso(FIXTURE_NOW - 10 * 24 * H), date: "2026-10-25" },
    rule: { minHours: 36, leagues: ["NFL", "NCAAF"], price: "DraftKings, from ESPN", status: "tracked, not leans" },
    record: {
      all: { all: { n: 3, w: 1, l: 1, push: 1, units: 2.5, clvN: 3, clv: 0.03, beat: 2, moveN: 3, move: 0.06, toward: 2 }, NFL: { n: 3 }, NCAAF: { n: 0 } },
      clears: { all: { n: 1, w: 1, l: 0, push: 0, units: 3.5, clvN: 1, clv: 0.04, beat: 1, moveN: 1, move: 0.05, toward: 1 }, NFL: { n: 1 }, NCAAF: { n: 0 } }
    },
    upcoming: [
      game("g1", "NFL", SUN, BUF, MIA, "away", 0.20, 950, { more: { now: { at: iso(FIXTURE_NOW - H), odds: 800, prob: 0.21 } } }),
      game("g2", "NFL", SUN, KC, ARI, "away", 0.30, 550, { more: { now: { at: iso(FIXTURE_NOW - H), odds: 650, prob: 0.29 } } }),
      game("c1", "NCAAF", SAT, OSU, MICH, "home", 0.62, -130),
      game("g3", "NFL", THU, DAL, TEN, "home", 0.55, -150),
      game("g4", "NFL", TODAY, KC, BUF, "home", 0.58, -120) /* kicked off at 1 PM today: awaiting its final, never offered */
    ],
    recent: [
      game("r1", "NFL", MON, BUF, KC, "home", 0.40, 250, { more: { status: "graded", result: "Win", score: { home: 27, away: 20 }, units: 2.5, clv: 0.03, move: 0.05, closeOdds: 200 } }),
      game("r2", "NFL", MON - 3 * H, DAL, ARI, "away", 0.45, 120, { more: { status: "graded", result: "Loss", score: { home: 30, away: 10 }, units: -1, clv: -0.01, move: -0.02, closeOdds: 130 } }),
      game("r3", "NFL", MON - 6 * H, TEN, MIA, "home", 0.50, 100, { more: { status: "graded", result: "Push", score: { home: 17, away: 17 }, units: 0, clv: 0.01, move: 0.03, closeOdds: -105 } }),
      game("r4", "NCAAF", MON - 30 * H, MICH, OSU, "away", 0.52, -110, { more: { status: "graded", result: "Void", units: 0 } })
    ]
  });
  const errors = [];
  const open = async (opts) => {
    opts = opts || {};
    const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 900 }, colorScheme: "dark" });
    await ctx.route("**/site.api.espn.com/**", route => route.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: '{"events":[]}' }));
    const d = opts.data === undefined ? sample() : opts.data;
    if (d !== null) await ctx.route("**/data/early-line.js", route => route.fulfill({ contentType: "text/javascript", body: typeof d === "string" ? d : "window.EARLY_DATA = " + JSON.stringify(d) + ";" }));
    const page = await ctx.newPage(); await pinClock(page, opts.at);
    const errs = []; page.on("pageerror", e => errs.push("PAGEERROR " + e.message)); page.on("console", m => { if (m.type() === "error" && !/ERR_|Failed to load resource/.test(m.text())) errs.push(m.text()); });
    await page.goto(url("picks.html")); await page.waitForTimeout(450);
    return { page, close: async () => { errs.forEach(e => errors.push(e)); await ctx.close(); } };
  };
  const view = page => page.evaluate(() => {
    const sec = document.getElementById("early-sec"), txt = n => (n ? n.innerText.replace(/\s+/g, " ").trim() : null);
    const tables = sec ? Array.from(sec.querySelectorAll(".early-table")) : [];
    const rows = t => t ? Array.from(t.querySelectorAll("tbody > tr")).map(tr => tr.classList.contains("day-divider") ? "day:" + txt(tr) : tr.getAttribute("data-game")) : [];
    const cells = (t, id) => { const tr = t && t.querySelector('tr[data-game="' + id + '"]'); return tr ? Array.from(tr.children).map(td => txt(td)) : null; };
    return {
      hidden: !sec || sec.hidden, link: (function () { const a = document.querySelector('.subnav a[href="#early"]'); return a ? !a.hidden : false; })(),
      strip: Array.from(document.querySelectorAll(".subnav a")).filter(a => !a.hidden).map(a => a.getAttribute("href")).join(" "),
      record: Array.from(document.querySelectorAll("#early-record .meta > span")).map(txt).join(" | ") || txt(document.getElementById("early-record")), heads: Array.from(sec ? sec.querySelectorAll(".early-h") : []).map(txt),
      up: rows(tables[0]), done: rows(tables[1]), ranks: tables[0] ? Array.from(tables[0].querySelectorAll(".rank")).map(txt) : [],
      past: Array.from(sec ? sec.querySelectorAll("tr[data-game] .early-past") : []).map(n => n.closest("tr").getAttribute("data-game")),
      g1: cells(tables[0], "NFL|g1"), g2: cells(tables[0], "NFL|g2"), c1: cells(tables[0], "NCAAF|c1"), r1: cells(tables[1], "NFL|r1"), r2: cells(tables[1], "NFL|r2"), g4: cells(tables[1], "NFL|g4"),
      chips: tables[1] ? Array.from(tables[1].querySelectorAll(".badge-state")).map(n => n.textContent) : [], more: Array.from(sec ? sec.querySelectorAll("[data-more]") : []).map(txt),
      buttons: Array.from(sec ? sec.querySelectorAll("button, a.btn") : []).map(txt), overflow: document.documentElement.scrollWidth > window.innerWidth,
      grid: tables[0] ? getComputedStyle(tables[0].querySelector("tr.early-row")).display : null
    };
  });
  /* the suite's own stub: no early lines, the page as it was */
  const none = await open({ data: null }), vn = await view(none.page);
  check("early lines: with no file the section and its strip link are hidden, and the strip is as it was", vn.hidden && !vn.link && vn.strip.indexOf("#early") === -1, JSON.stringify(vn));
  await none.close();
  const smp = await open({ data: Object.assign(sample(), { sample: true }) }), vs = await view(smp.page);
  check("early lines: a sample file is not shown", vs.hidden && !vs.link);
  await smp.close();
  const a = await open(), v = await view(a.page);
  check("early lines: with a file the section shows, its strip link between In progress and results and the market board", !v.hidden && v.link && / #played #early #market$/.test(v.strip), v.strip);
  check("early lines: the record says how the ones past their bar and every game did, at the locked price, and how often the line moved our way",
    v.record === "Past their bar: 1-0, +3.50u (+350.0% ROI), line moved our way on 1 of 1 (+5.0 pts a game) | Every game: 1-1-1, +2.50u (+83.3% ROI), line moved our way on 2 of 3 (+2.0 pts a game) | CLV +1.0 pts a game", v.record);
  check("early lines: still to kick off, game day first with a heading per day, then likeliest, ranked; a game past its kickoff is not offered",
    JSON.stringify(v.up) === JSON.stringify(["day:Tomorrow", "NFL|g3", "day:Sat Nov 7", "NCAAF|c1", "day:Sun Nov 8", "NFL|g2", "NFL|g1"]) && v.ranks.join() === "#1,#2,#3,#4" && v.heads[0] === "Locked and still to kick off (4)", JSON.stringify([v.up, v.ranks, v.heads]));
  check("early lines: only a side past its own bar is marked Past its bar", JSON.stringify(v.past.sort()) === JSON.stringify(["NFL|g1", "NFL|g2", "NFL|r1"].filter(id => v.past.indexOf(id) !== -1).sort()) && v.past.indexOf("NFL|g1") !== -1 && v.past.indexOf("NFL|g3") === -1 && v.past.indexOf("NCAAF|c1") === -1, JSON.stringify(v.past));
  check("early lines: each row gives our chance, DraftKings' price when locked, the edge against its bar, and where DraftKings is now (toward us or away)",
    v.g1[3] === "20.0%" && v.g1[4] === "+950 yesterday 10:45 AM ET" && /^\+10\.5 pts 4\.5 past its bar$/.test(v.g1[5]) && v.g1[6] === "+800, moved our way" && v.g2[6] === "+650, moved away" && v.c1[6] === "No move yet" && /short of its bar$/.test(v.c1[5]), JSON.stringify([v.g1, v.g2, v.c1]));
  check("early lines: graded newest first with the result, the final, units and the line by the close; a game under way awaits its final",
    JSON.stringify(v.done) === JSON.stringify(["NFL|g4", "NFL|r1", "NFL|r2", "NFL|r3", "NCAAF|r4"]) && v.chips.join() === "Awaiting the final,Won,Lost,Push,Void" && /^Won Final KC 20, BUF 27$/i.test(v.r1[3]) && v.r1[4] === "+2.50u" && v.r1[5] === "+5.0 pts toward our side" && v.r2[4] === "-1.00u" && v.r2[5] === "-2.0 pts away from our side" && v.heads[1] === "Graded and awaiting a final", JSON.stringify([v.done, v.chips, v.r1, v.r2]));
  check("early lines: nothing in the section is a bet: no slip, ticket or breakdown button, only the list's own Show all", v.buttons.length === 0 && (await a.page.$$eval("#early-sec [data-add], #early-sec .pick-card, #early-sec [data-slip]", n => n.length)) === 0, JSON.stringify(v.buttons));
  await a.close();
  /* twenty-five still to kick off: twenty, then Show all */
  const many = sample(); many.upcoming = Array.from({ length: 25 }, (_, i) => game("m" + i, "NCAAF", SAT + i * 6e4, OSU, MICH, "home", 0.5 + i / 100, -110));
  const b = await open({ data: many }), vb = await view(b.page);
  check("early lines: twenty rows, then Show all", vb.up.filter(x => x.indexOf("day:") !== 0).length === 20 && vb.more.join() === "Show all 25" && vb.up[0] === "NCAAF|m24", JSON.stringify([vb.up.length, vb.more]));
  await b.page.click("#early-sec [data-more]"); await b.page.waitForTimeout(150);
  const vb2 = await view(b.page);
  check("early lines: Show all lists every one, still likeliest first", vb2.up.filter(x => x.indexOf("day:") !== 0).length === 25 && vb2.more.length === 0 && vb2.ranks[24] === "#25", JSON.stringify([vb2.up.length, vb2.more, vb2.ranks.slice(-1)]));
  await b.close();
  /* the clock: Thursday night, the Thursday game has kicked off and moves to the graded list */
  const c = await open({ at: THU + 10 * 6e4 }), vc = await view(c.page);
  check("early lines: a locked game moves from the list to awaiting its final once it kicks off (the page's own clock)", vc.up.indexOf("NFL|g3") === -1 && vc.done.indexOf("NFL|g3") !== -1, JSON.stringify([vc.up, vc.done]));
  await c.close();
  /* nothing graded yet */
  const fresh = sample(); fresh.recent = []; fresh.record = { all: { all: { n: 0 } }, clears: { all: { n: 0 } } };
  const d = await open({ data: fresh }), vd = await view(d.page);
  check("early lines: before anything is graded the record line says when the first locked game kicks off", vd.record === "Nothing graded yet: the first locked game kicks off Thu 8:15 PM ET." || /^Nothing graded yet: the first locked game kicks off /.test(vd.record), vd.record);
  await d.close();
  /* a phone */
  const p = await open({ viewport: { width: 400, height: 860 } }), vp = await view(p.page);
  check("early lines (400px): rows become cards and nothing overflows the page", vp.grid === "grid" && !vp.overflow, JSON.stringify([vp.grid, vp.overflow]));
  await p.close();
  check("early lines: no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
}
module.exports = { run };
