/* ==========================================================================
   EdgeLine AI — NBA game-day availability (2026-11-08; the owner chose "NBA lineups and late injury news" as the next data:
   the model should know who actually plays tonight)
   The NBA's official injury report is a PDF the league publishes every 15 minutes, all day, at
   ak-static.cms.nba.com/referee/injury/Injury-Report_YYYY-MM-DD_HH_MMAM|PM.pdf (Eastern time; hourly, "_05PM", until
   mid-2025-26). Teams must list every player who may miss a game: Out, Doubtful, Questionable, Probable or Available, with
   the reason, by 5 PM local the day before and through game day. This module reads it with no dependency (the PDF's
   content streams are FlateDecode, its fonts WinAnsi TrueType: each table cell is a clip rectangle holding its words) and
   merges it with ESPN's injury report, newest first, into the listing shape the model's injury cost reads.
   Terms: NBA.com's terms of use (last updated 2026-07-13) carry no clause against automated access and robots.txt allows
   /referee/ (Crawl-Delay 1; one request a run here). They keep the materials for personal, non-commercial use and ask
   written permission for public or commercial reuse: like ESPN's data, fine for this demo, licensed before the service is
   sold. Only facts (a player's status at a time) are used, never the document itself. RULES.officialReport turns it off.
   ========================================================================== */
"use strict";
const zlib = require("zlib");

const REPORT_BASE = "https://ak-static.cms.nba.com/referee/injury/Injury-Report_";
const ET = "America/New_York";
/* how likely a listed player is to miss the game, by the report's status. Measured 2026-11-08 on the report itself: every
   report published at the morning run (14:00 UTC), the afternoon run (20:30 UTC) and 22:30 UTC on every game day from
   2023-24 to 2026-11-04 (1,512 PDFs), each listing matched to the club's players in ESPN's box scores (did he play that
   night?), weighted by his scoring (points a game times his share of the club's games, what his cost scales with). Out
   99.0 / 99.3 / 99.4% at the three times (16,262 / 20,710 / 22,132 listings), Doubtful 95.7 / 98.7 / 98.8% (864 / 937 /
   728), Questionable 41.5 / 42.7 / 40.9% (5,525 / 5,932 / 4,811), Probable 6.6 / 4.0 / 3.9%, Available 5.0 / 3.8 / 3.1%,
   against 2.9% for a rotation player no report listed. The model costs a player at this share of his full cost (12% of
   his points a game, over the games the team played with him); under model.MIN_MISS (Probable, Available) nothing. */
const MISS = { out: 1, doubtful: 0.97, questionable: 0.42, probable: 0.04, available: 0 };

/* ---------- Eastern time ---------- */
function etParts(ms) { return Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: ET, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(ms)).map(p => [p.type, p.value])); }
/* an Eastern wall-clock time as a UTC instant (DST-aware: the offset is read at the guess and once more after it) */
function etToUtc(y, mo, d, h, mi) {
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  let t = wall + 5 * 36e5;
  for (let k = 0; k < 2; k++) { const p = etParts(t); const seen = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute); t += wall - seen; }
  return t;
}
/* "1:30 PM ET" */
function etLabel(ms) { return new Intl.DateTimeFormat("en-US", { timeZone: ET, hour: "numeric", minute: "2-digit" }).format(new Date(ms)) + " ET"; }
/* the report's name for the 15-minute slot at or before ms: "2026-11-08_01_30PM" (hourly: "2025-01-15_01PM") */
function reportName(ms, hourly) {
  const p = etParts(ms), h = +p.hour % 24, m = hourly ? 0 : +p.minute - (+p.minute % 15);
  const ap = h >= 12 ? "PM" : "AM", h12 = h % 12 === 0 ? 12 : h % 12;
  return p.year + "-" + p.month + "-" + p.day + "_" + String(h12).padStart(2, "0") + (hourly ? "" : "_" + String(m).padStart(2, "0")) + ap;
}
/* the URLs to try for the newest report at `ms`, newest first: the slot at or before it, then 15 minutes back at a time
   (a report lands a few seconds after its time; a late or skipped one falls back to the one before) */
function reportUrls(ms, n) {
  const out = [];
  for (let k = 0; k < (n || 4); k++) out.push(REPORT_BASE + reportName(ms - k * 15 * 6e4) + ".pdf");
  return out;
}

/* ---------- the PDF, without a dependency ---------- */
/* every object's dictionary and (inflated) stream */
function pdfObjects(buf) {
  const s = buf.toString("latin1"), objs = {}, re = /(\d+)\s+0\s+obj\b/g;
  let m;
  while ((m = re.exec(s))) {
    const start = m.index + m[0].length, end = s.indexOf("endobj", start); if (end < 0) break;
    const body = s.slice(start, end), si = body.indexOf("stream");
    const o = { dict: si >= 0 ? body.slice(0, si) : body, stream: null };
    if (si >= 0) {
      let p = start + si + 6; if (s[p] === "\r") p++; if (s[p] === "\n") p++;
      const lm = /\/Length\s+(\d+)(\s+\d+\s+R)?/.exec(o.dict);
      let len = lm && !lm[2] ? Number(lm[1]) : -1;
      if (len < 0) { const e = s.indexOf("endstream", p); len = e - p; }
      let raw = buf.slice(p, p + len);
      if (/\/FlateDecode/.test(o.dict)) { try { raw = zlib.inflateSync(raw); } catch (err) { raw = null; } }
      o.stream = raw;
    }
    objs[m[1]] = o;
  }
  return objs;
}
const refs = (dict, key) => { const m = new RegExp("/" + key + "\\s*\\[([^\\]]*)\\]").exec(dict); if (m) return (m[1].match(/(\d+)\s+0\s+R/g) || []).map(r => r.split(/\s+/)[0]); const one = new RegExp("/" + key + "\\s+(\\d+)\\s+0\\s+R").exec(dict); return one ? [one[1]] : []; };
/* the content stream's tokens: numbers, names, strings (literal and hex), arrays, operators */
function tokens(src) {
  const out = []; let i = 0; const n = src.length;
  const isWs = c => c === " " || c === "\n" || c === "\r" || c === "\t" || c === "\f" || c === "\0";
  const isDelim = c => "()<>[]{}/%".indexOf(c) >= 0;
  while (i < n) {
    const c = src[i];
    if (isWs(c)) { i++; continue; }
    if (c === "%") { while (i < n && src[i] !== "\n" && src[i] !== "\r") i++; continue; }
    if (c === "(") {
      let depth = 1, str = ""; i++;
      while (i < n && depth) {
        const ch = src[i];
        if (ch === "\\") {
          const nx = src[i + 1];
          const esc = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" };
          if (nx in esc) { str += esc[nx]; i += 2; }
          else if (/[0-7]/.test(nx)) { let o = ""; i++; while (o.length < 3 && /[0-7]/.test(src[i])) o += src[i++]; str += String.fromCharCode(parseInt(o, 8)); }
          else if (nx === "\r" || nx === "\n") { i += 2; if (nx === "\r" && src[i] === "\n") i++; }
          else { str += nx || ""; i += 2; }
          continue;
        }
        if (ch === "(") depth++;
        if (ch === ")") { depth--; if (!depth) { i++; break; } }
        str += ch; i++;
      }
      out.push({ s: str }); continue;
    }
    if (c === "<" && src[i + 1] !== "<") {
      const e = src.indexOf(">", i); const hex = src.slice(i + 1, e).replace(/\s+/g, ""); let str = "";
      for (let k = 0; k < hex.length; k += 2) str += String.fromCharCode(parseInt((hex.slice(k, k + 2) + "0").slice(0, 2), 16));
      out.push({ s: str }); i = e + 1; continue;
    }
    if (c === "<" || c === ">") { i += 2; out.push({ op: c + c }); continue; }
    if (c === "[") { out.push({ op: "[" }); i++; continue; }
    if (c === "]") { out.push({ op: "]" }); i++; continue; }
    if (c === "/") { let j = i + 1; while (j < n && !isWs(src[j]) && !isDelim(src[j])) j++; out.push({ name: src.slice(i + 1, j) }); i = j; continue; }
    let j = i; while (j < n && !isWs(src[j]) && !isDelim(src[j])) j++;
    const w = src.slice(i, j); i = j > i ? j : i + 1;
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(w)) out.push({ n: Number(w) }); else out.push({ op: w });
  }
  return out;
}
/* a page's words: [{ cell: [x, y, w, h] (the clip rectangle the word was drawn in, null outside one), x, y, w, size, text }] */
function pageWords(content, fonts) {
  const toks = tokens(content.toString("latin1")), words = [];
  let st = [], arr = null, rect = null, clip = false, cell = null; const saved = [];
  /* lineX/lineY: where the text line starts (Td moves it); lx/ly: where the next word goes (a shown word moves it on) */
  let font = null, size = 0, lineX = 0, lineY = 0, lx = 0, ly = 0;
  const width = str => { if (!font) return 0; let w = 0; for (const ch of str) { const k = ch.charCodeAt(0) - font.first; w += (font.widths[k] != null ? font.widths[k] : 500); } return w / 1000 * Math.abs(size); };
  const show = str => { if (!str) return; const w = width(str); words.push({ cell: cell, x: lx, y: ly, w: w, size: Math.abs(size), text: str }); lx += w; };
  for (const t of toks) {
    if (t.op === "[") { arr = []; continue; }
    if (t.op === "]") { st.push({ arr: arr }); arr = null; continue; }
    if (arr) { arr.push(t); continue; }
    if (!t.op) { st.push(t); continue; }
    const num = k => st[st.length - k] && st[st.length - k].n;
    switch (t.op) {
      /* the clip and the font are graphics state: Q restores both (the report's cells set no font of their own) */
      case "q": saved.push({ cell: cell, font: font, size: size }); break;
      case "Q": { const g = saved.pop() || { cell: null, font: font, size: size }; cell = g.cell; font = g.font; size = g.size; break; }
      case "re": rect = [num(4), num(3), num(2), num(1)]; break;
      case "W": case "W*": clip = true; break;
      case "n": if (clip && rect) cell = rect; clip = false; break;
      case "BT": lineX = lineY = lx = ly = 0; break;
      case "Tf": font = fonts[(st[st.length - 2] || {}).name] || null; size = num(1) || size; break;
      case "Td": case "TD": lineX += num(2) || 0; lineY += num(1) || 0; lx = lineX; ly = lineY; break;
      case "Tm": lineX = num(2) || 0; lineY = num(1) || 0; lx = lineX; ly = lineY; break;
      case "Tj": case "'": case "\"": { const s = st[st.length - 1]; if (s && s.s != null) show(s.s); break; }
      case "TJ": { const a = st[st.length - 1]; if (a && a.arr) a.arr.forEach(x => { if (x.s != null) show(x.s); else if (x.n != null) lx -= x.n / 1000 * Math.abs(size); }); break; }
      default: break;
    }
    st = [];
  }
  return words;
}
/* the pages in order, each a list of words */
function pdfPages(buf) {
  const objs = pdfObjects(buf);
  const cat = Object.values(objs).find(o => /\/Type\s*\/Catalog/.test(o.dict)); if (!cat) return [];
  const root = refs(cat.dict, "Pages")[0];
  const pages = [];
  const walk = id => { const o = objs[id]; if (!o) return; if (/\/Type\s*\/Pages/.test(o.dict)) refs(o.dict, "Kids").forEach(walk); else if (/\/Type\s*\/Page\b/.test(o.dict)) pages.push(o); };
  walk(root);
  return pages.map(function (pg) {
    const fonts = {}, fm = /\/Font\s*<<([^>]*)>>/.exec(pg.dict);
    if (fm) (fm[1].match(/\/(\w+)\s+(\d+)\s+0\s+R/g) || []).forEach(f => {
      const [, nm, id] = /\/(\w+)\s+(\d+)/.exec(f), fo = objs[id] || { dict: "" };
      const wm = /\/Widths\s*\[([^\]]*)\]/.exec(fo.dict), first = /\/FirstChar\s+(\d+)/.exec(fo.dict);
      fonts[nm] = { first: first ? Number(first[1]) : 0, widths: wm ? wm[1].trim().split(/\s+/).map(Number) : [] };
    });
    const content = Buffer.concat(refs(pg.dict, "Contents").map(id => (objs[id] && objs[id].stream) || Buffer.alloc(0)));
    return pageWords(content, fonts);
  });
}
/* the words of one cell as text: words on a line joined (a space where the gap is a space's width), lines joined */
function cellText(words) {
  const lines = [];
  words.forEach(w => { const l = lines.find(x => Math.abs(x.y - w.y) < 1); if (l) l.words.push(w); else lines.push({ y: w.y, words: [w] }); });
  return lines.sort((a, b) => a.y - b.y).map(l => l.words.sort((a, b) => a.x - b.x).reduce((s, w, k, all) => {
    if (!k) return w.text;
    const prev = all[k - 1], gap = w.x - (prev.x + prev.w);
    return s + (gap > 0.12 * (w.size || 10) ? " " : "") + w.text;
  }, "")).join(" ").replace(/\s+/g, " ").trim();
}

/* ---------- the report ---------- */
const COLS = [["gameDate", /^game date$/i], ["gameTime", /^game time$/i], ["matchup", /^matchup$/i], ["team", /^team$/i], ["player", /^player name$/i], ["status", /^current status$/i], ["reason", /^reason$/i]];
/* "Jackson Jr., Jaren" -> "Jaren Jackson Jr."; "Udeh, Jr., Ernest" -> "Ernest Udeh Jr." (the first name follows the last comma) */
function displayName(raw) { const parts = String(raw || "").split(","); if (parts.length < 2) return parts[0].trim(); return (parts[parts.length - 1] + " " + parts.slice(0, -1).join(" ")).replace(/\s+/g, " ").trim(); }
/* parse one report: { at (ISO, the report's own time), label ("1:30 PM ET"), rows: [{ gameDate (YYYY-MM-DD), gameTime,
   matchup, away, home (abbreviations), team, player, name, status, reason }], teams: [{ team, gameDate, matchup, submitted }] } */
function parseReport(buf) {
  const pages = pdfPages(buf); if (!pages.length) return null;
  let at = null; const rows = [], teams = [], head = {};
  let carry = {};
  pages.forEach(function (words) {
    const title = cellText(words.filter(w => w.size >= 16));
    const tm = /Injury Report:\s*(\d{2})\/(\d{2})\/(\d{2})\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(title);
    if (tm && !at) { let h = Number(tm[4]) % 12; if (/PM/i.test(tm[6])) h += 12; at = new Date(etToUtc(2000 + Number(tm[3]), Number(tm[1]), Number(tm[2]), h, Number(tm[5]))).toISOString(); }
    /* group the words by their cell */
    const cells = new Map();
    words.forEach(w => { if (!w.cell) return; const k = w.cell.map(v => Math.round(v * 10) / 10).join(","); if (!cells.has(k)) cells.set(k, { x: w.cell[0], y: w.cell[1], words: [] }); cells.get(k).words.push(w); });
    const list = Array.from(cells.values()).map(c => ({ x: c.x, y: c.y, text: cellText(c.words) })).filter(c => c.text);
    /* the column heads are on the first page only: later pages keep their positions */
    let headY = -Infinity;
    list.forEach(c => { const col = COLS.find(([, re]) => re.test(c.text)); if (col) { head[col[0]] = c.x; headY = c.y; } });
    if (head.player == null) return;
    const colOf = x => { let best = null, d = 4; Object.keys(head).forEach(k => { const dd = Math.abs(head[k] - x); if (dd < d) { d = dd; best = k; } }); return best; };
    /* rows: cells within a point and a half of each other */
    const body = list.filter(c => c.y > headY + 1).sort((a, b) => a.y - b.y);
    const lines = [];
    body.forEach(c => { const col = colOf(c.x); if (!col) return; let l = lines.find(x => Math.abs(x.y - c.y) <= 1.5); if (!l) { l = { y: c.y }; lines.push(l); } l[col] = l[col] ? l[col] + " " + c.text : c.text; });
    lines.sort((a, b) => a.y - b.y).forEach(function (l) {
      if (l.gameDate) carry = { gameDate: l.gameDate };
      ["gameDate", "gameTime", "matchup"].forEach(k => { if (l[k]) carry[k] = l[k]; });
      if (l.matchup && !l.team) delete carry.team;
      if (l.team) carry.team = l.team;
      const dm = /(\d{2})\/(\d{2})\/(\d{4})/.exec(carry.gameDate || ""), mm = /^([A-Z]{2,4})@([A-Z]{2,4})$/.exec((carry.matchup || "").replace(/\s+/g, ""));
      const base = { gameDate: dm ? dm[3] + "-" + dm[1] + "-" + dm[2] : null, gameTime: carry.gameTime || null, matchup: carry.matchup || null, away: mm ? mm[1] : null, home: mm ? mm[2] : null, team: carry.team || null };
      if (!base.team) return;
      let t = teams.find(x => x.team === base.team && x.gameDate === base.gameDate);
      if (!t) { t = { team: base.team, gameDate: base.gameDate, matchup: base.matchup, submitted: true }; teams.push(t); }
      if (!l.player) { if (/not yet submitted/i.test(l.reason || l.status || "")) t.submitted = false; return; }
      rows.push(Object.assign(base, { player: l.player, name: displayName(l.player), status: (l.status || "").trim(), reason: (l.reason || "").trim() }));
    });
  });
  return { at: at, label: at ? etLabel(Date.parse(at)) : null, rows: rows, teams: teams };
}

/* ---------- matching names (the report writes "Claxton, Nicolas"; ESPN "Nic Claxton") ---------- */
function nameKey(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[.'’`]/g, "").replace(/-/g, " ").replace(/\b(jr|sr|ii|iii|iv|v)\b/g, " ").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim(); }
function lastKey(s) { const k = nameKey(s).split(" "); return k[k.length - 1] || ""; }
/* the one entry in `list` (each with .name) that is this player: the whole name, else the last name and first initial
   (Nic / Nicolas Claxton) when only one player carries them; null otherwise. The last name alone is never enough: on a
   club's roster it paired a two-way "Moses Brown" with "Bruce Brown" */
function findPlayer(list, name) {
  const k = nameKey(name), last = lastKey(name), init = k[0];
  const exact = list.filter(p => nameKey(p.name) === k); if (exact.length === 1) return exact[0];
  const li = list.filter(p => lastKey(p.name) === last && nameKey(p.name)[0] === init); return li.length === 1 ? li[0] : null;
}
function statusKey(s) { const k = String(s || "").toLowerCase().trim(); return k in MISS ? k : null; }

/* ---------- merging with ESPN, newest first ----------
   espn: the team's ESPN listings (context.teamInjuries: name, pos, athleteId, status, date, ...).
   report: parseReport's result; team: the club's name as the odds feed writes it; gameDate: the game's Eastern date;
   matches(teamName, reportTeam): the club matcher (context.teamMatches). roster: optional [{ name, id, pos }] to give a
   player only the report lists his ESPN id (for the games he played and his points).
   Every listing comes back with `source` ("official" | "espn"), `at` (when that source said it) and, from the report,
   `miss` (MISS by status), `report` ("1:30 PM ET") and `reason`. A player on ESPN's list but not on a newer submitted
   report for this game is available: the team's list for the game no longer has him (status Available, miss 0). A team
   whose report is "not yet submitted", or a game the report does not carry yet, keeps ESPN's list as it is. */
function mergeTeam(espn, report, team, gameDate, matches, roster) {
  const mine = (espn || []).map(i => Object.assign({}, i, { source: "espn", at: i.date || null }));
  if (!report || !report.at) return mine;
  const t = (report.teams || []).find(x => x.gameDate === gameDate && matches(team, x.team));
  if (!t) return mine;
  const rows = report.rows.filter(r => r.gameDate === gameDate && r.team === t.team);
  if (!t.submitted && !rows.length) return mine;
  const atMs = Date.parse(report.at), used = new Set(), out = [];
  rows.forEach(function (r) {
    const k = statusKey(r.status);
    const e = findPlayer(mine.filter(x => !used.has(x)), r.name);
    if (e) used.add(e);
    /* ESPN's entry wins only when it is newer than the report */
    if (e && e.at && Date.parse(e.at) > atMs) { out.push(Object.assign(e, { official: { status: r.status, at: report.at, reason: r.reason } })); return; }
    const ros = !e && roster ? findPlayer(roster, r.name) : null;
    out.push(Object.assign({}, e || {}, {
      name: e ? e.name : ros ? ros.name : r.name, pos: (e && e.pos) || (ros && ros.pos) || null, athleteId: (e && e.athleteId) || (ros && ros.id) || null,
      status: r.status, miss: k ? MISS[k] : null, source: "official", at: report.at, report: report.label, reason: r.reason, espn: e ? { status: e.status, at: e.at } : null
    }));
  });
  mine.filter(e => !used.has(e)).forEach(function (e) {
    if (t.submitted && (!e.at || Date.parse(e.at) <= atMs)) out.push(Object.assign({}, e, { status: "Available", miss: 0, source: "official", at: report.at, report: report.label, reason: "Not on the report", espn: { status: e.status, at: e.at } }));
    else out.push(e);
  });
  return out;
}
/* the report's games, as the odds feed's clubs: is this game on it, and has each side submitted */
function gameOnReport(report, home, away, gameDate, matches) {
  if (!report) return null;
  const side = name => (report.teams || []).find(x => x.gameDate === gameDate && matches(name, x.team)) || null;
  const h = side(home), a = side(away);
  return h || a ? { home: h ? h.submitted : null, away: a ? a.submitted : null } : null;
}

/* ---------- after a pick is posted: did who plays change? ----------
   A posted pick is locked (graded at its posted price), so nothing here touches it; it only says, for the pages, when
   the availability behind it moved after it was posted. posted / read: { report: { label, at } | null, read (ISO),
   home: [listing], away: [listing] }, each listing { name, status, miss, source, at, report, full } (full: his cost on
   the margin were he out; model.availItem). A player missing from a list is not listed (he plays). */
const SEVERE = /^(out|injured reserve|ir|doubtful|suspended|season)/i, SOFT = /^(questionable|day-to-day|day to day|probable|game time)/i;
function missOf(i) { return !i ? 0 : Number.isFinite(i.miss) ? i.miss : SEVERE.test(i.status || "") ? 1 : SOFT.test(i.status || "") ? 0.5 : 0; }
const r2 = n => Math.round(n * 100) / 100;
/* the listings whose chance of missing moved by a tenth or more and whose cost on the margin moved by `min` points or more
   (opts.min, 0.5; opts.fullOf(listing) prices a player the posted snapshot did not carry, e.g. from data/faces.js).
   null when the comparison cannot be trusted: the pick was posted on the official report and this read has none (ESPN
   alone would read differently, not newer). Each change: { side, name, from, to, fromMiss, toMiss, delta (points of
   cost on that side's margin, + when he is likelier to miss), at, source, report } */
function changesSince(posted, read, opts) {
  opts = opts || {};
  if (!posted || !read || (posted.report && !read.report)) return null;
  const min = opts.min != null ? opts.min : 0.5, out = [];
  ["home", "away"].forEach(function (side) {
    const then = (posted[side] || []).slice(), now = read[side] || [], pairs = [];
    now.forEach(b => { const a = findPlayer(then, b.name); if (a) then.splice(then.indexOf(a), 1); pairs.push([a, b]); });
    then.forEach(a => pairs.push([a, null]));
    pairs.forEach(function ([a, b]) {
      const ma = missOf(a), mb = missOf(b);
      if (Math.abs(mb - ma) < 0.1) return;
      /* his cost were he out: the fresh read's (a full run re-ran the model), else what the pick was posted on (0 for a
         player who had missed every game: his return moves nothing), else opts.fullOf for a newly listed player */
      const full = b && Number.isFinite(b.full) ? b.full : a && Number.isFinite(a.full) ? a.full : opts.fullOf ? opts.fullOf(b || a) : null;
      if (!(full > 0)) return;
      const delta = full * (mb - ma);
      if (Math.abs(delta) < min) return;
      out.push({ side: side, name: (b || a).name, from: a ? a.status || "Listed" : "Not listed", to: b ? b.status || "Listed" : "Not listed", fromMiss: ma, toMiss: mb, delta: r2(delta),
        at: (b && b.at) || read.read || null, source: b ? b.source || "espn" : read.report ? "official" : "espn", report: b ? b.report || null : read.report ? read.report.label : null });
    });
  });
  return out;
}
function changeText(c) {
  const to = String(c.to || "").toLowerCase();
  const verb = c.toMiss >= 0.75 ? (/^out/.test(to) ? "ruled out" : "downgraded to " + to)
    : c.toMiss >= 0.1 ? (c.toMiss > c.fromMiss ? "downgraded to " : "upgraded to ") + to
    : /^probable/.test(to) ? "upgraded to probable" : "cleared to play";
  const when = c.at ? " at " + etLabel(Date.parse(c.at)) : "";
  return c.name + " " + verb + when + (c.source === "official" ? " (official report)" : " (ESPN)");
}
/* the flag a posted pick carries: { changed, note, swing (points of margin toward the pick's side; null for a total,
   since the model takes nothing off a total for injuries), changes, checkedAt }. prev: the pick's earlier flag, whose
   first-seen times are kept (a change read at 5:30 PM is still "at 5:30 PM" an hour later) */
function flagOf(entry, changes, prev, nowIso) {
  const side = entry.marketKey === "totals" ? null : entry.outcome && entry.outcome.name === entry.home ? "home" : entry.outcome && entry.outcome.name === entry.away ? "away" : null;
  (changes || []).forEach(c => { const p = prev && (prev.changes || []).find(x => nameKey(x.name) === nameKey(c.name) && x.to === c.to); if (p && p.at && (!c.at || Date.parse(p.at) < Date.parse(c.at))) c.at = p.at; });
  if (!changes || !changes.length) return { changed: false, note: null, swing: null, changes: [], checkedAt: nowIso };
  const swing = side ? r2(changes.reduce((s, c) => s + (c.side === side ? -c.delta : c.delta), 0)) : null;
  const posted = entry.loggedAt ? ", after this " + (String(entry.confidence || "").toLowerCase() === "lean" ? "lean" : "pick") + " was posted at " + etLabel(Date.parse(entry.loggedAt)) : ", after this pick was posted";
  const effect = swing == null ? "; the model takes nothing off a total for injuries" : Math.abs(swing) < 0.05 ? "" : "; about " + Math.abs(swing).toFixed(1) + " points of margin " + (swing > 0 ? "for" : "against") + " this side on our numbers";
  return { changed: true, note: changes.map(changeText).join("; ") + posted + effect, swing: swing, changes: changes, checkedAt: nowIso };
}

/* what is still open about who plays in a game (model.forEvent's availability), at a level:
   "report": a club the official report does not carry yet or has not submitted for (a game on a later day: clubs submit by
     5 PM local the day before, back-to-backs by 1 PM ET on game day);
   "open": that, and a costed player (his full cost `min` points or more) whose status is a coin flip (questionable or
     game-time: a tenth to three quarters likely to miss; doubtful players sat 97-98% of the time and count as out;
     without a readable report, ESPN's day-to-day listings). [] when nothing is open, and always without a report to read
     at the "report" level (an unreadable report holds nothing) */
function unresolvedOf(av, min, level) {
  if (!av || !level) return [];
  const out = [], floor = min != null ? min : 0.5;
  if (av.report && (!av.onReport || av.onReport.home !== true || av.onReport.away !== true)) out.push("report not in for both clubs");
  if (level === "open") ["home", "away"].forEach(side => (av[side] || []).forEach(i => { const m = missOf(i); if (m >= 0.1 && m < 0.75 && i.full >= floor) out.push(i.name + " " + String(i.status || "").toLowerCase()); }));
  return out;
}

module.exports = { MISS, REPORT_BASE, missOf, unresolvedOf, changesSince, flagOf, changeText, etToUtc, etLabel, reportName, reportUrls, parseReport, pdfPages, displayName, nameKey, findPlayer, statusKey, mergeTeam, gameOnReport };
