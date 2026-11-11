#!/usr/bin/env node
/* Pick feeds. Reads the data files and writes two subscription files at the site root:
     picks.ics  a calendar subscription: one event per pick at tip-off (alert 30 minutes before), "in play" once the game
                starts, the grade written into the same event after the game, and an all-day "no play" event on the
                nights nothing clears the bar
     feed.xml   an RSS feed: one item per pick (marked "in play" once the game starts), a new item per grade in its
                place, one per slate (run), newest first
   picks.js keeps started and graded picks on the day's card, so a pick can be in picks.js and the log at once; each is
   written once, under the same UID and guid it had before the game.
   No network. Deterministic for a given set of data files, so the workflow only commits when the data moved.
   Wording: the selections are "leans" until the owner flips `call` in data/replay.js to "picks" (2026-11-05: a replay
   of past seasons lost money at the closing price in every league). The switch is read from the data directory's
   replay.js; without it the feeds say leans. File names, UIDs and guids never change.
   Run: node scripts/feeds.js [--data <dir>] [--out <dir>] [--base <site url>] */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_BASE = "https://ajur21.github.io/edgeline-ai/";
const ET = "America/New_York";
const HISTORY_DAYS = 30;
const GAME_HOURS = 3;
const ALARM_MINUTES = 30;
const MAX_ITEMS = 80;

/* ---------- helpers ---------- */
function readWindowFile(file, key) {
  if (!fs.existsSync(file)) return null;
  const w = {};
  vm.runInNewContext(fs.readFileSync(file, "utf8"), { window: w });
  return w[key] || null;
}
function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return fallback; } }
function implied(o) { o = Number(o); return o > 0 ? 100 / (o + 100) : -o / (-o + 100); }
function fmtOdds(o) { o = Number(o); return (o > 0 ? "+" : "") + o; }
function pct(p, d) { return (Number(p) * 100).toFixed(d == null ? 1 : d) + "%"; }
function signed(n, d) { const v = Number(n).toFixed(d == null ? 2 : d); return (Number(v) > 0 ? "+" : "") + v; }
function pts(p) { return signed(Number(p) * 100, 1) + " pts"; }
function edgeOf(p) { return Number(p.modelProb) - implied(p.odds); }
function etParts(d) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: ET, weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
  const o = {}; f.formatToParts(new Date(d)).forEach(p => { o[p.type] = p.value; });
  return o;
}
function etDate(d) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: ET, year: "numeric", month: "2-digit", day: "2-digit" });
  return f.format(new Date(d));
}
function etLabel(d) { const p = etParts(d); return p.weekday + " " + p.month + " " + p.day + ", " + p.hour + ":" + p.minute + " " + p.dayPeriod + " ET"; }
function etDay(d) { const p = etParts(d); return p.weekday + " " + p.month + " " + p.day; }
function resultLabel(e) {
  if (e.status === "void") return "Void";
  if (e.result === "Win") return "Won " + signed(e.units) + "u";
  if (e.result === "Loss") return "Lost " + signed(e.units) + "u";
  if (e.result === "Push") return "Push";
  return null;
}
/* still to be settled: picks.js written before 2026-11-05 carries no status, which meant pending */
function isPending(p) { return p.status == null || p.status === "pending"; }
/* the final as "away-home", from the log's string or picks.js' { home, away } */
function scoreText(s) {
  if (s == null || s === "") return null;
  if (typeof s === "object") return s.home != null && s.away != null ? s.away + "-" + s.home : null;
  return String(s);
}
function ladder(p) {
  const prices = p.prices || {};
  return Object.keys(prices).map(b => ({ book: b, price: Number(prices[b]) })).filter(x => isFinite(x.price)).sort((a, b) => implied(a.price) - implied(b.price));
}

/* ---------- iCalendar ---------- */
function icsText(s) { return String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/[,;]/g, m => "\\" + m); }
function icsStamp(d) { return new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }
function icsDay(ymd) { return ymd.replace(/-/g, ""); }
function nextDay(ymd) { const d = new Date(ymd + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); }
/* RFC 5545 folding: lines of at most 75 octets, continuations start with one space */
function fold(line) {
  let out = "", cur = "", len = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch, "utf8");
    if (len + b > 75) { out += cur + "\r\n "; cur = ""; len = 1; }
    cur += ch; len += b;
  }
  return out + cur;
}
function vevent(ev) {
  const lines = ["BEGIN:VEVENT", "UID:" + ev.uid, "DTSTAMP:" + icsStamp(ev.stamp)];
  if (ev.allDay) { lines.push("DTSTART;VALUE=DATE:" + icsDay(ev.day)); lines.push("DTEND;VALUE=DATE:" + icsDay(nextDay(ev.day))); }
  else { lines.push("DTSTART:" + icsStamp(ev.start)); lines.push("DTEND:" + icsStamp(ev.end)); }
  lines.push("SUMMARY:" + icsText(ev.summary));
  if (ev.description) lines.push("DESCRIPTION:" + icsText(ev.description));
  if (ev.location) lines.push("LOCATION:" + icsText(ev.location));
  if (ev.url) lines.push("URL:" + ev.url);
  if (ev.categories && ev.categories.length) lines.push("CATEGORIES:" + ev.categories.map(icsText).join(","));
  lines.push("LAST-MODIFIED:" + icsStamp(ev.stamp));
  lines.push("STATUS:CONFIRMED");
  lines.push("TRANSP:TRANSPARENT");
  if (ev.alarmMinutes) lines.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + icsText(ev.summary), "TRIGGER:-PT" + ev.alarmMinutes + "M", "END:VALARM");
  lines.push("END:VEVENT");
  return lines;
}
function vcalendar(name, desc, events) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//EdgeLine AI//Picks//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:" + icsText(name), "X-WR-CALDESC:" + icsText(desc), "X-WR-TIMEZONE:" + ET,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"];
  events.forEach(ev => { lines.push.apply(lines, vevent(ev)); });
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/* ---------- RSS ---------- */
function xml(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function html(lines) {
  /* a plain-text block becomes simple HTML: paragraphs, and "- " lines become list items */
  const out = []; let list = null;
  lines.filter(l => l != null && l !== "").forEach(function (l) {
    if (/^- /.test(l)) { if (!list) { list = []; } list.push("<li>" + xml(l.slice(2)) + "</li>"); return; }
    if (list) { out.push("<ul>" + list.join("") + "</ul>"); list = null; }
    out.push("<p>" + xml(l) + "</p>");
  });
  if (list) out.push("<ul>" + list.join("") + "</ul>");
  return out.join("");
}
function rss(channel, items) {
  const head = ['<?xml version="1.0" encoding="UTF-8"?>', '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">', "<channel>",
    "<title>" + xml(channel.title) + "</title>", "<link>" + xml(channel.link) + "</link>", "<description>" + xml(channel.description) + "</description>",
    "<language>en-us</language>", "<lastBuildDate>" + new Date(channel.updated).toUTCString() + "</lastBuildDate>", "<ttl>60</ttl>",
    '<atom:link href="' + xml(channel.self) + '" rel="self" type="application/rss+xml"/>'];
  const body = items.map(it => ["<item>", "<title>" + xml(it.title) + "</title>", "<link>" + xml(it.link) + "</link>",
    '<guid isPermaLink="false">' + xml(it.guid) + "</guid>", "<pubDate>" + new Date(it.date).toUTCString() + "</pubDate>",
    it.category ? "<category>" + xml(it.category) + "</category>" : "", "<description>" + xml(html(it.lines)) + "</description>", "</item>"].filter(Boolean).join("\n"));
  return head.concat(body, ["</channel>", "</rss>"]).join("\n") + "\n";
}

/* ---------- the wording switch (data/replay.js `call`, the same one the pages read) ---------- */
const CALL_WORDS = {
  leans: { one: "lean", many: "leans", One: "Lean", Many: "Leans", ofDay: "Lean of the day", parlayOfDay: "Parlay lean of the day" },
  picks: { one: "pick", many: "picks", One: "Pick", Many: "Picks", ofDay: "Play of the day", parlayOfDay: "Parlay of the day" }
};
let W = CALL_WORDS.leans, REPLAY = null;
function callOf(replay, override) { const c = override || (replay && replay.call); return c === "picks" ? "picks" : "leans"; }
function roiText(v) { v = Number(v); return (v < 0 ? "−" : v > 0 ? "+" : "") + Math.abs(v).toFixed(1) + "%"; }
/* the replay against the close, one sentence (the pages' replayText) */
function replayLine() {
  const ls = REPLAY && Array.isArray(REPLAY.leagues) ? REPLAY.leagues.filter(l => Number.isFinite(Number(l.roiClose))) : [];
  const f = ls.map(l => l.league + " " + roiText(l.roiClose)).join(", "), leans = W === CALL_WORDS.leans;
  return "In a replay of past seasons " + (leans ? "these leans" : "the model's selections") + " did not beat the closing price" + (f ? " (" + f + " ROI at the close)" : "") + ". " +
    (leans ? "They become picks when the live record beats the close." : "Judge them by the live record.");
}

/* ---------- content ---------- */
/* the lowest tier shows as "Low" (owner decision, 2026-11-08; the data keeps "Lean", see tierLabel in js/app.js) */
function tierLabel(c) { return c === "Lean" ? "Low" : c; }
function pickTitle(p) { return p.pick + " " + fmtOdds(p.odds) + " at " + p.book; }
function pickItemTitle(p, potd) { return (potd ? W.ofDay + ": " : p.sport + ": ") + pickTitle(p) + " (" + (p.confidence ? tierLabel(p.confidence) : W.One) + ", " + pts(edgeOf(p)) + ")"; }
function pickLines(p, base) {
  const b = p.breakdown || {}, lad = ladder(p), edge = edgeOf(p);
  const lines = [
    p.sport + " · " + p.event + " · " + etLabel(p.commence),
    p.market + ": " + p.pick + " at " + fmtOdds(p.odds) + " (" + p.book + "). Our probability " + pct(p.modelProb) + " from game data, the price implies " + pct(implied(p.odds)) + ", edge " + pts(edge) + (p.ev != null ? ", EV " + signed(p.ev * 100, 1) + "% per unit" : "") + "." + (p.confidence ? " Confidence: " + p.confidence + "." : ""),
    p.rationale || null
  ];
  if (b.support && b.support.length) { lines.push("What supports it:"); b.support.forEach(s => lines.push("- " + s)); }
  if (b.risks && b.risks.length) { lines.push("What could go wrong:"); b.risks.forEach(s => lines.push("- " + s)); }
  if (b.verdict) lines.push("Verdict: " + b.verdict);
  if (lad.length > 1) lines.push("Prices: " + lad.slice(0, 5).map(x => x.book + " " + fmtOdds(x.price)).join(", ") + (lad.length > 5 ? " and " + (lad.length - 5) + " more" : "") + ".");
  lines.push("Full breakdown: " + base + "picks.html#" + p.id);
  return lines;
}
/* a player prop that is the play of the day (scripts/of-day.js): its chance is the model's, checked against the props
   graded so far (`keep` is the share of a stated edge the record has borne out), and it is graded on the box score */
function propLines(e, base) {
  const res = resultLabel(e);
  const lines = [e.sport + " · " + e.event + " · " + etLabel(e.commence),
    "Player prop: " + e.pick + " at " + fmtOdds(e.odds) + " (" + e.book + "). Our chance " + pct(e.prob) + (e.stated != null && e.keep != null ? " (the model's own " + pct(e.stated) + ", cut to the " + Math.round(e.keep * 100) + "% of an edge that graded props have borne out)" : "") +
      ", the price implies " + pct(implied(e.odds)) + (e.ev != null ? ", EV " + signed(e.ev * 100, 1) + "% per unit" : "") + "." + (e.tier ? " Grade: " + tierLabel(e.tier) + "." : "")];
  if (res) lines.push(res + (e.actual != null ? ": finished on " + e.actual + " " + String(e.statLabel || "").toLowerCase() + ", graded on the box score." : "."));
  else (e.reasons || []).slice(0, 4).forEach(r => lines.push("- " + r));
  lines.push(res ? "Record and every graded " + W.one + ": " + base + "performance.html" : "Every prop, ranked: " + base + "props.html");
  return lines;
}
function gradedLines(e, base) {
  const lines = [e.sport + " · " + e.event + " · " + etLabel(e.commence), e.market + ": " + e.pick + " at " + fmtOdds(e.odds) + " (" + e.book + "). " + resultLabel(e) + "."];
  const final = scoreText(e.score);
  if (final) lines.push("Final: " + final);
  if (typeof e.clv === "number") lines.push("Closing line value: " + pts(e.clv) + (e.close && e.close.odds != null ? " (closed " + fmtOdds(e.close.odds) + (e.close.source ? ", " + e.close.source : "") + ")" : "") + ".");
  else if (e.lineMove) lines.push("The line moved " + e.lineMove + " the " + W.one + " before close.");
  lines.push("Record and every graded " + W.one + ": " + base + "performance.html");
  return lines;
}
function closest(market, n) {
  const seen = {}, out = [];
  /* closest to its own bar (rows priced since 2026-11-05 carry `past`, edge minus the side's bar); older files by edge */
  const gap = r => r.past != null ? Number(r.past) : r.edge != null ? Number(r.edge) - (market.threshold || 0.03) : -9;
  (market.rows || []).filter(r => r.edge != null).sort((a, b) => gap(b) - gap(a)).forEach(function (r) {
    const key = r.eventId + "|" + r.marketKey;
    if (r.status === "pick" || seen[key] || out.length >= n) return;
    seen[key] = true; out.push(r);
  });
  return out;
}
function marketRowTitle(r) { return r.pick + " " + fmtOdds(r.odds) + " at " + r.book + " (" + pts(r.edge) + (r.bar != null ? " against a bar of " + pts(r.bar) : "") + ")"; }

function build(opts) {
  opts = opts || {};
  const dataDir = opts.data || path.join(ROOT, "data");
  const base = (opts.base || DEFAULT_BASE).replace(/\/?$/, "/");
  REPLAY = readWindowFile(path.join(dataDir, "replay.js"), "REPLAY_DATA");
  W = CALL_WORDS[callOf(REPLAY, opts.call)];
  const picks = readWindowFile(path.join(dataDir, "picks.js"), "PICKS_DATA") || { sample: true, picks: [] };
  const market = readWindowFile(path.join(dataDir, "market.js"), "MARKET_DATA") || { rows: [], games: 0, threshold: 0.01 };
  const log = readJson(path.join(dataDir, "picks-log.json"), []);
  const sample = picks.sample !== false;
  const updated = picks.trackedAt || picks.generatedAt || market.generatedAt || new Date(0).toISOString();
  const now = opts.now ? new Date(opts.now) : new Date(updated);
  const since = now.getTime() - HISTORY_DAYS * 864e5;
  /* picks.js is the day's card: the board plus every pick whose game started in the last 18 hours, with its status,
     result and score. A pick is upcoming only while it is pending and its game is ahead. */
  const card = (picks.picks || []).filter(p => p && p.id && p.commence);
  const upcoming = card.filter(p => isPending(p) && Date.parse(p.commence) > now.getTime());
  const logSingles = (Array.isArray(log) ? log : []).filter(e => e && !e.type && e.id && e.commence);
  const logProps = (Array.isArray(log) ? log : []).filter(e => e && e.type === "prop" && e.id && e.commence);
  const potdId = picks.playOfDay && picks.playOfDay.id;
  const bar = ((market.threshold || 0.01) * 100).toFixed(0);
  /* since 2026-11-05 each side has its own bar (the model's own margin of error on it, never under the floor) */
  const perSide = !!(market.bars && Object.keys(market.bars).length), barName = perSide ? "its bar" : "the " + bar + "-point bar";
  const slateDay = etDate(picks.generatedAt || updated);
  const name = "EdgeLine AI " + W.many + (sample ? " (sample data)" : "");
  const events = [], items = [];

  /* upcoming picks: one event (with the alarm) and one item each */
  upcoming.forEach(function (p) {
    const potd = p.id === potdId;
    const summary = (potd ? W.ofDay + ": " : "") + pickTitle(p) + (p.confidence ? " · " + tierLabel(p.confidence) : "");
    const start = Date.parse(p.commence);
    events.push({ uid: p.id + "@edgeline", stamp: p.pricesAt || updated, start: start, end: start + GAME_HOURS * 36e5, summary: summary,
      description: pickLines(p, base).join("\n"), location: p.context && p.context.venue, url: base + "picks.html#" + p.id, categories: [p.sport], alarmMinutes: ALARM_MINUTES });
    items.push({ guid: p.id, date: p.loggedAt || picks.generatedAt || updated, link: base + "picks.html#" + p.id, category: p.sport,
      title: pickItemTitle(p, potd), lines: pickLines(p, base) });
  });

  /* parlay of the day: its legs (game leans or player props) carry their start; an older file's are found on the card
     or in the log, so the event keeps its times once they start */
  const parlay = picks.parlayOfDay;
  if (parlay && parlay.legs && parlay.legs.length) {
    const byId = {}; logProps.forEach(e => { byId[e.id] = e; }); logSingles.forEach(e => { byId[e.id] = e; }); card.forEach(p => { byId[p.id] = p; });
    const starts = parlay.legs.map(l => Date.parse(l.commence || (byId[l.id] && byId[l.id].commence))).filter(Boolean);
    const title = W.parlayOfDay + ": " + parlay.legs.length + " legs " + fmtOdds(parlay.odds) + " at " + parlay.book;
    const lines = ["All legs priced at " + parlay.book + ". Fair " + pct(parlay.fairProb) + ", implied " + pct(implied(parlay.odds)) + (parlay.ev != null ? ", EV " + signed(parlay.ev * 100, 1) + "% per unit" : "") + "."]
      .concat(parlay.legs.map(l => "- " + l.sport + ": " + l.pick + " " + fmtOdds(l.price) + " · " + l.event), [resultLabel(parlay) ? "Result: " + resultLabel(parlay) : null, "Every parlay: " + base + "picks.html#parlays"]);
    if (starts.length) {
      const start = Math.min.apply(null, starts);
      events.push({ uid: parlay.id + "@edgeline", stamp: updated, start: start, end: Math.max.apply(null, starts) + GAME_HOURS * 36e5, summary: title + (resultLabel(parlay) ? " · " + resultLabel(parlay) : ""),
        description: lines.join("\n"), url: base + "picks.html#parlays", categories: ["Parlay"], alarmMinutes: ALARM_MINUTES });
    }
    items.push({ guid: parlay.id, date: parlay.lockedAt || picks.generatedAt || updated, link: base + "picks.html#parlays", category: "Parlay", title: title, lines: lines });
  }

  /* a player prop as the play of the day: never on the card, so nothing above wrote it. From its log entry, like a lean:
     ahead with its alarm, in play, then its grade (the event keeps its UID, the item gives way to a "#graded" one). A
     void one (the player did not play) is left out. A prop that is only a parlay leg is listed in the parlay, not on its own. */
  logProps.filter(e => e.potd && e.status !== "void" && Date.parse(e.commence) >= since).forEach(function (e) {
    const start = Date.parse(e.commence), res = resultLabel(e), ahead = !res && start > now.getTime();
    const url = base + (res ? "performance.html" : "index.html#plays"), lines = propLines(e, base);
    events.push({ uid: e.id + "@edgeline", stamp: e.gradedAt || e.lockedAt || updated, start: start, end: start + GAME_HOURS * 36e5,
      summary: W.ofDay + ": " + pickTitle(e) + (res ? " · " + res : ahead ? (e.tier ? " · " + tierLabel(e.tier) : "") : " · in play"),
      description: lines.join("\n"), url: url, categories: [e.sport, "Prop"], alarmMinutes: ahead ? ALARM_MINUTES : 0 });
    if (res) items.push({ guid: e.id + "#graded", date: e.gradedAt || updated, link: url, category: e.sport, title: "Graded: " + e.pick + " " + fmtOdds(e.odds) + " · " + res, lines: lines });
    else items.push({ guid: e.id, date: e.lockedAt || updated, link: url, category: e.sport, title: W.ofDay + ": " + pickTitle(e) + " (" + (e.tier ? tierLabel(e.tier) + ", " : "") + pct(e.prob) + " to hit)" + (ahead ? "" : " · in play"), lines: lines });
  });

  /* every pick that has started, once each whether it is on the card, in the log or both (the log's entry wins: it
     carries the grade's time, close and CLV). It keeps its UID and guid: in play until graded (the calendar event and
     the pick's own item say "· in play"), then the result is written into the event and the item gives way to a new
     "#graded" item, so readers are told. Void picks are left out; the log reaches back HISTORY_DAYS. */
  const logById = {}; logSingles.forEach(e => { logById[e.id] = e; });
  const seen = {}; upcoming.forEach(p => { seen[p.id] = true; });
  const started = [];
  card.forEach(p => { if (!seen[p.id]) { seen[p.id] = true; started.push(logById[p.id] || p); } });
  logSingles.forEach(e => { if (!seen[e.id] && Date.parse(e.commence) >= since) { seen[e.id] = true; started.push(e); } });
  started.forEach(function (e) {
    if (e.status === "void") return;
    const start = Date.parse(e.commence), res = resultLabel(e);
    if (!res && start > now.getTime()) return; /* pending future picks live in picks.js */
    events.push({ uid: e.id + "@edgeline", stamp: e.gradedAt || e.pricesAt || updated, start: start, end: start + GAME_HOURS * 36e5,
      summary: pickTitle(e) + (res ? " · " + res : " · in play"), description: (res ? gradedLines(e, base) : pickLines(e, base)).join("\n"),
      location: e.context && e.context.venue, url: base + (res ? "performance.html" : "picks.html#" + e.id), categories: [e.sport] });
    if (res) items.push({ guid: e.id + "#graded", date: e.gradedAt || updated, link: base + "performance.html", category: e.sport, title: "Graded: " + e.pick + " " + fmtOdds(e.odds) + " · " + res, lines: gradedLines(e, base) });
    else items.push({ guid: e.id, date: e.loggedAt || picks.generatedAt || updated, link: base + "picks.html#" + e.id, category: e.sport, title: pickItemTitle(e, e.id === potdId) + " · in play", lines: pickLines(e, base) });
  });

  /* the slate: an all-day event on a no-play night, and an item for every run. Its picks are the ones still ahead when
     the run priced them; one that has started since stays counted, so a pick night never reads "no play" at tip-off. */
  const near = closest(market, 3);
  const sides = (market.rows || []).length, games = market.games || 0;
  const pricedAt = Date.parse(picks.generatedAt || updated);
  const slate = card.filter(p => p.status !== "void" && Date.parse(p.commence) > pricedAt);
  const noPlay = !slate.length;
  const slateTitle = noPlay
    ? (sides ? "No " + W.one + " tonight: " + sides + " sides priced in " + games + " games, none clears " + (perSide ? "its bar" : "the " + bar + "-point bar") : "No " + W.one + " tonight: nothing priced yet")
    : slate.length + " " + (slate.length === 1 ? W.one : W.many) + " tonight from " + sides + " priced sides";
  const slateLines = [noPlay
    ? (sides ? "Every main-line side was given our probability from the game data. None sits above what its best price implies by " + (perSide ? "its own bar (" + bar + " points or more: the model's margin of error on that side)" : barName) + ", so there is no bet." : "The next run prices the slate before the evening games.")
    : W.Many + " are the sides where our probability from the game data sits above what the best price implies by " + (perSide ? "its own bar (" + bar + " points or more: the model's margin of error on that side), one " + W.one + " a game at most" : barName + " or more") + "; the price is only the number to clear. Each one is above, with its price, book and breakdown.", replayLine()]
    .concat(near.length ? ["Closest to the bar:"].concat(near.map(r => "- " + r.sport + ": " + marketRowTitle(r) + " · " + r.event)) : [], ["The market board: " + base + "picks.html#market"]);
  if (noPlay && sides) {
    events.push({ uid: "slate-" + slateDay + "@edgeline", stamp: updated, allDay: true, day: slateDay, summary: slateTitle, description: slateLines.join("\n"), url: base + "picks.html#market", categories: ["Slate"] });
  }
  items.push({ guid: "slate-" + (picks.generatedAt || updated), date: picks.generatedAt || updated, link: base + (noPlay ? "picks.html#market" : "digest.html"), category: "Slate", title: etDay(picks.generatedAt || updated) + " slate: " + slateTitle, lines: slateLines });

  events.sort((a, b) => (a.allDay ? Date.parse(a.day + "T00:00:00Z") : a.start) - (b.allDay ? Date.parse(b.day + "T00:00:00Z") : b.start));
  items.sort((a, b) => (Date.parse(b.date) - Date.parse(a.date)) || ((b.category === "Slate") - (a.category === "Slate")));
  const ics = vcalendar(name, "Every EdgeLine AI " + W.one + " at tip-off with its price, book and edge; the grade follows when the game ends. " + replayLine() + " Informational only; 21+.", events);
  const feed = rss({ title: name, link: base, self: base + "feed.xml", updated: updated,
    description: "Sports betting " + W.many + " from a game-data model: every " + W.one + " with our probability and its edge over the price, every grade, every slate. " + replayLine() + " Informational only; 21+." }, items.slice(0, MAX_ITEMS));
  return { ics: ics, rss: feed, events: events.length, items: Math.min(items.length, MAX_ITEMS), sample: sample, noPlay: noPlay };
}

function write(opts) {
  opts = opts || {};
  const out = opts.out || ROOT;
  const r = build(opts);
  fs.writeFileSync(path.join(out, "picks.ics"), r.ics);
  fs.writeFileSync(path.join(out, "feed.xml"), r.rss);
  return r;
}

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--data") o.data = path.resolve(argv[++i]);
    else if (a === "--out") o.out = path.resolve(argv[++i]);
    else if (a === "--base") o.base = argv[++i];
    else if (a === "--now") o.now = argv[++i];
  }
  return o;
}

if (require.main === module) {
  const o = parseArgs(process.argv.slice(2));
  if (o.out) fs.mkdirSync(o.out, { recursive: true });
  const r = write(o);
  console.log("Feeds written: " + r.events + " calendar events, " + r.items + " feed items" + (r.noPlay ? " (no play tonight)" : "") + (r.sample ? " [sample data]" : ""));
}

module.exports = { build: build, write: write, fold: fold, icsText: icsText, xml: xml, html: html, etDate: etDate, etLabel: etLabel };
