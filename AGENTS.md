# EdgeLine AI — agent brief

Read this first. It is the hand-off document for any agent or developer working on this site.

## What this is

A static marketing and product website for an AI sports betting picks service. Three pages, no framework, no build step. Open `index.html` in a browser or serve the folder from any static host.

"EdgeLine AI" is a placeholder brand. All copy, prices, picks and performance numbers are placeholders and are labelled "Sample data" in the UI. Do not remove those labels until real data is wired in.

## File map

```
index.html           Landing: ticker, hero + today's board, play of the day + parlay of the day, how it works + edge calculator, top 3 picks, pricing, FAQ
picks.html           Best parlays (ranked by EV, 2-4 legs, one book per ticket; #parlays), all picks with filters and sort, card/table view (with a Books column), parlay builder slip (#parlay)
digest.html          Daily digest: one printable page for the slate. Lede, four tiles, play and parlay of the day, top three by EV, every pick grouped by start time with its verdict, price, edge, confidence and live status. "Print or save as PDF" and "Copy as text" (plain text for a chat or email)
performance.html     Stat tiles, play/parlay/CLV record tiles, profit calendar, cumulative units line chart, units by sport bars, graded results table with a CLV column
props.html           NBA props research: tonight's rotation players with headshot, per-card stat chips, a PrizePicks-style history chart (bars per game, typed line drawn across, green over / red under, opponent + date labels, L5/L10 toggle, hit pill), confluence signals and a game log. No betting lines
journal.html         Personal bet log: form with screenshots, stats, profit calendar, export/import. IndexedDB on the visitor's device only; no backend
css/styles.css       ALL styles. Design tokens live in :root at the top; dark theme in the two blocks below it
js/app.js            Loaded in <head>. Theme, nav, odds math, pick cards/table, flip + tilt + reveal, play-of-the-day and parlay cards, parlay maths + slip (localStorage), profit calendar, line shopping (lineShop, shopChips, shopTable, shopSummary), live slots. Exposes window.EdgeLine
js/live.js           Live in-game status (index, picks, digest). Polls ESPN's public scoreboard from the browser once games start and fills every [data-live="<pick id>"] slot with score, clock and where the pick stands. Exposes window.EdgeLineLive
js/charts.js         Dependency-free SVG line + bar charts with tooltips, keyboard nav, table twins. Exposes window.EdgeLineCharts
js/space.js          Canvas space backdrop (parallax stars, nebulae, flare, shooting stars, vignette); light theme = daylight sky; still frame under reduced motion
data/picks.js        -> window.PICKS_DATA  { sample, source, generatedAt, picks: [...] }   (sample until the pipeline runs)
data/performance.js  -> window.PERF_DATA   { sample, asOf, record, units, roi, avgEdge, daily, bySport, recent }
data/picks-log.json  Every pick ever published, with grading; the pipeline's source of truth (created on first real run)
scripts/update-data.js  Data pipeline: The Odds API -> de-vigged consensus -> edges -> log -> grade -> rewrite the two data files
scripts/data-test.js    Offline pipeline test against scripts/fixtures/ (run by `npm test`)
scripts/context.js     Pick context + breakdown writer: ESPN injuries/scoreboard/schedules, Open-Meteo weather, price history (used by update-data.js)
scripts/update-props.js Props research pipeline: ESPN public endpoints -> data/props.js (`npm run props`)
scripts/props-test.js   Offline props pipeline test against scripts/fixtures/espn/
data/props.js        -> window.PROPS_DATA { sample, source, attribution, generatedAt, games, players }
scripts/screenshot.js Playwright render check (see Verify)
scripts/behavior.js  Playwright behaviour checks: nav state, filters, chart edge cases, keyboard access (see Verify)
package.json         Dev-only: `npm run check` runs the render check; Playwright is the only dependency
README.md            Human-facing overview and customisation notes
```

The header and footer are duplicated verbatim in all six HTML files. If you change one, change all six.

## Conventions (keep these)

- **The look is locked (owner decision, 2026-11-04).** Galaxy canvas backdrop, dark default with glass surfaces, Sora / Inter / Oswald / JetBrains Mono, vibrant per-sport palette, 3D pressable buttons, tilt and flip cards, scroll reveal, ticker. New pages and features adopt this system as-is; do not restyle, remove the backdrop, or introduce a different aesthetic without the owner asking.
- Vanilla HTML/CSS/JS only. No bundler, no framework, no npm dependencies at runtime. Playwright is a dev-only dependency for the screenshot check.
- Data arrives through `window.PICKS_DATA` and `window.PERF_DATA` so the site works from `file://`. Keep that shape; a backend can regenerate the two data files or you can swap the `<script src="data/...">` tags for a `fetch()` that resolves to the same JSON.
- All DOM text is inserted with `textContent` via the `el()` helper in `js/app.js`. Never build HTML strings from data.
- Colors and fonts are tokens in `css/styles.css` `:root`. Components reference tokens only. Every color token is defined on bare `:root` and redefined in both dark blocks (`prefers-color-scheme` guarded by `:root:not([data-theme="light"])`, and `:root[data-theme="dark"]`). Do not introduce literal colors in component rules.
- Any element rendered after page load that should tilt needs `data-tilt` and a call to `EdgeLine.initTilt(scope)` (see the picks page render function).
- No inline `style=""` attributes in HTML. Page-level layout helpers live in `css/styles.css` (`.section-flush`, `.stack`, `.page-head`, `.page-title`, `.page-sub`, `.footer-blurb`, `.footer-age`).
- User-facing copy never contains developer instructions ("placeholder", "replace with your own", "edit these"). Mark sample content with the `badge-sample` label instead.
- The favicon is an inline SVG data URI and each page carries Open Graph and Twitter card meta in `<head>`; keep the three heads in step.
- Fonts, each with a job: Sora (headlines and pick selections: geometric, confident), Inter (body: neutral, trustworthy), Oswald (eyebrows, badges, stat labels, table headers, ticker: condensed uppercase scoreboard energy), JetBrains Mono (odds, figures, axis ticks: precision). Loaded from Google Fonts with system fallbacks. Keep the roles; do not let one font take over.
- Odds are American format. Implied probability and edge are computed client-side in `js/app.js` (`impliedProb`, `edgeOf`). Edge = fair (consensus) probability − implied probability. The pipeline computes the same numbers server-side; keep the two in agreement.
- Charts: 2px accent line with a vertical gradient fade underneath (SVG gradient, stop colors from tokens), hairline solid gridlines, 24px bars with 4px rounded data-ends square at the baseline, bars colored by sport via `data-cat` and the `--sport-*` tokens, legend omitted, a table view for every chart, tooltips that enhance but never gate. Status colors (green win, red loss) are reserved for results.
- Theme: dark by default (space backdrop); light is an opt-in via the toggle and renders the same field as a pale daylight sky. Surfaces are translucent tokens with `backdrop-filter` so the stars show through; keep that when adding surfaces.
- Design direction: vibrant and tactile, set against a cinematic space canvas (`js/space.js`). Left-aligned layout, small radii (6px/10px), cards only for distinct objects (a pick, a plan, a chart). Electric blue leads; magenta (`--accent-2`), lime (`--accent-3`) and orange (`--accent-4`) are accents, and each sport has its own hue (`--sport-nfl` etc.) used on sport badges and chart bars. Confidence badges: High lime, Medium blue, Lean orange. 3D cues: buttons sit on a solid `--edge` and press down on click; elements marked `data-tilt` lean toward the cursor with a spotlight (`initTilt` in `js/app.js`); section containers rotate into place on scroll (`.reveal`, `initReveal`). Hero carries two blurred color glows. All motion is disabled under `prefers-reduced-motion`. Avoid: emoji, centered hero, blurred gradient blobs, gradient-filled text, uniform tinted cards.
- The responsible gambling notice, 21+ marker and 1-800-GAMBLER helpline in the footer stay on every page.

## Verify

```
npm install && npx playwright install chromium   # once
npm run check                                    # render check, writes screenshots/
npm test                                         # behaviour checks (nav, filters, charts, keyboard)
```

The render check scrolls each page first so scroll-revealed sections are in their final state, then exits non-zero on any console error or horizontal overflow and writes 12 full-page screenshots to `screenshots/`. The behaviour check exits non-zero on any failed assertion. Run both after any change to HTML, CSS or JS and look at the images.

## Data pipeline

`scripts/update-data.js` is the "backend". `.github/workflows/update-data.yml` runs it twice a day, 17:00 UTC (around noon Eastern) and 20:30 UTC (late afternoon, before the evening slates), and on demand, then commits `data/` and redeploys. A 4 AM run found no edges; the two-run schedule is an experiment, and each logged pick records `loggedAt` so the log shows which run produces edges. Drop the weaker one later. It needs the `ODDS_API_KEY` repository secret (a key from https://the-odds-api.com; the free tier is 500 requests/month).

How a pick is made (all in `update-data.js`, tunable in `RULES`):
1. For each active sport (on its game days: NBA/NHL/MLB daily, NFL Wed/Sat/Sun/Mon, Premier League Fri-Sun; La Liga is switched off to stay inside the free tier), fetch moneyline, spread and total prices for ten named bookmakers: Pinnacle plus nine bettable U.S. books (ten bookmakers cost the same as one region: 3 requests per sport, 2 for soccer).
2. Per event and market, group books by exact line and keep the largest group (at least 3 books). The **fair** probability is Pinnacle's de-vigged price for that line (the sharp reference); if Pinnacle does not price it, the de-vigged average of the other books stands in. The site calls this "Fair"; the data field is still `modelProb`.
3. For each outcome, take the best price among the bettable books (never Pinnacle). Edge = fair − implied(best price). Edge of 1 point or more becomes a pick (Lean; about +2% expected value at even odds); 2 is Medium; 3.5 is High. Each pick records `ev` (expected profit per unit). Only one side of a market can be picked.
4. At most 4 picks per sport and 12 per run; only events starting within 36 hours. A pick is logged once per event+market+outcome+line, at the price seen. On every later run before tip-off, `priceOutcomes()` prices **every** outcome on every line two or more books share (not just the main line, not just positive edges) so each pending pick's `current` price and `history` keep updating even after its edge is gone or its line is no longer the main one. That is what makes the close real.
5. Pending picks whose events started 3+ hours ago are graded from the scores endpoint (2 requests per sport with pending picks). Win pays the profit at the logged odds for 1 unit; loss is −1; push 0. Ungraded after 7 days becomes `void` and is excluded. At grading, `close` (the last history point before tip-off: price, fair, sample count) and `clv` are written. **CLV** = closing fair probability − implied probability of the logged price, in probability points; positive means the price we took beat where the sharp market finished. A pick with no price check after it was logged gets `clv: null`, never zero (two runs a day means a pick logged at the last pre-game run has no closing sample).
6. `performance.js` summarises graded picks from the last 30 days by event date (Eastern), plus `byDate` (all-time daily profit for the calendar), `potd` and `parlays` records, and `clv` (`n` picks with a closing sample, `avg` in points, `beat`, `beatPct`, `graded`); each `recent` row carries `clv` and `closeOdds`. `picks.js` is every pending pick whose event is still ahead, each with `prices` (price at every bettable book on that line), `books`, `anchor`, `ev`, `outcome`, `commence` and `sportKey` (the digest orders by `commence`; live status needs `sportKey`, `commence`, `outcome` and `context.espnEventId`).
7. **Play of the day** (`playOfDay` in picks.js): the highest-EV pick on the board, chosen once per Eastern day at the first run that has picks (`potd` date on the log entry) and never swapped that day. **Parlay of the day** (`parlayOfDay`): 2-3 legs from different games, all +EV at one book, the combination with the highest EV (fair = product of fair probabilities, treating legs as independent); logged as a `type: "parlay"` entry with `legPrices`, one per day. Parlays grade once every leg settles: any loss loses, pushes drop out, the rest pay the combined price; a void leg voids it.
8. **Breakdowns.** After the board is built, `scripts/context.js` enriches every pending pick (free sources, each optional): ESPN injuries for both teams (status, type, return date, note), the ESPN scoreboard for that date (venue, indoor flag, records, probable pitchers, TV, ESPN's own weather), each team's schedule (rest days, back-to-back, games in the last 7 days), and Open-Meteo wind/rain/temperature at kickoff for outdoor games (city geocoded from the venue). The pipeline also records every price it sees for a logged pick (`current`, `history`) so a breakdown can show line movement. `buildBreakdown()` writes: the tier and exactly why (edge vs the 1 / 2 / 3.5 point thresholds; confidence is the price edge only), the price rationale, "what supports it", "what could go wrong", notes and a one-line verdict. Rules of thumb: injuries on the pick's team are risks and on the opponent support; for totals, players out lean under; back-to-backs lean under and against the tired side; wind 15+ mph, rain 50%+ or freezing lean under; a sharp-line move of 1+ point toward or away is support or risk; edge gone at current prices is a risk. "Benching" and rest decisions surface through the injury report's status/type (e.g. "Out, Rest"); there is no separate lineup feed. The site shows all of this in the Full breakdown dialog (`EdgeLine.openBreakdown`), reachable from every card back, the play of the day and each parlay's legs.
9. The picks page lists the best parlays client-side: `EdgeLine.bestParlays` enumerates every 2-4 leg combination of distinct games that is +EV at a single book, keeps the best book per leg set, and ranks by EV. The parlay builder re-uses `prices` the same way: `EdgeLine.parlayMath` prices a slip at one book (auto-best, chosen, or mixed best prices with a warning). The slip lives in localStorage (`parlay-slip`, `parlay-book`).

Request budget: 3 per sport fetched (2 for soccer) plus 2 per sport with pending picks for grading, twice a day: roughly 450-480 a month against the free tier's 500. Adding La Liga or a third run needs the paid tier. The script stops fetching odds when the API reports fewer than 25 requests left. `node scripts/update-data.js --verbose --out /tmp/x` prints every line's best edge (costs real requests). Sample data stays in place (flagged `sample: true`) until the first real run; the UI hides "Sample" labels when `sample` is false.

To run locally: `ODDS_API_KEY=... npm run data`. To test without the network: `npm test` (uses `scripts/fixtures/`).

## Props research (no odds)

`scripts/update-props.js` runs in the same workflow step sequence as the picks (both daily runs) and never fails the job. It uses ESPN's public, undocumented endpoints with no key: scoreboard (tonight's games), every team's schedule (points allowed, ranked 1 = allows most), rosters of the teams playing (headshot, position, injury status), and each player's game log. Rotation players only (14+ minutes a game), up to 9 per team, last 10 regular-season games kept. About 300-500 ESPN requests per run with a 90 ms delay.

Signals (`signals()` in the script) are confluences, not bets: a stat up or down 12%+ over the last 5 vs the season, minutes up or down 10%+, a home/road scoring split of 12%+, back-to-back or 3+ days' rest, opponent in the top 8 or bottom 8 for points allowed, a steady scorer (last-10 standard deviation under 22% of the average), and any injury listing. The page lets the visitor type a line per stat and shows over hit rates for L5, L10 and the season; typed lines are kept in localStorage.

Prop betting lines are deliberately absent: they need The Odds API's paid tier (about 50 requests per NBA night). **Licensing:** ESPN's API is unofficial and its photos are not licensed for commercial use; the page credits ESPN and the data must move to a licensed provider (SportsDataIO, Sportradar) before this is sold.

## Line shopping, live status, digest

- **Line shopping** is client-side from `prices`. `EdgeLine.lineShop(pick)` sorts every book best to worst and counts how many still leave a 1-point edge ("clear the bar", the Lean threshold); `sole` is true when exactly one book does. Card fronts show the top three prices as chips plus "+N more" and a "One book only" badge; the breakdown dialog shows the full ladder with implied, edge and a state per book, and a warning when the edge lives at one book; the table view has a Books column (`clears/total`). Book abbreviations live in `BOOK_ABBR` in `js/app.js`.
- **Live status** (`js/live.js`) runs only when `PICKS_DATA.sample` is false and the page has `[data-live]` slots. For each pick within its window (20 minutes before `commence` to 5 hours after; no `commence` = today's scoreboard) it fetches ESPN's scoreboard for that sport and ET date (one request per sport+date per tick, cached 20 s), finds the game by `context.espnEventId` or team names, and renders a pill: `LIVE · clock · AWAY a–h HOME · covering by 3.5 / needs 7 more / leading by 4 / over by 2 / on the number`, or `Final · won (unofficial)`. Polls every 60 s while a game is in progress, every 5 min otherwise, never while the tab is hidden. It never grades anything; the pipeline does. ESPN's scoreboard returns `access-control-allow-origin: *`, so no proxy is needed. Failures are silent.
- **Digest** (`digest.html`) reads the same two data files. Groups are by `commence` (label "Today · 7:00 PM ET" / "Tomorrow" / weekday) and fall back to parsing the `start` label; a bare weekday in a label always means a later day. `@media print` in `css/styles.css` switches the tokens to a light palette and hides the backdrop, header, buttons and slip, so "Print or save as PDF" gives a clean one-pager. "Copy as text" writes a plain-text version (`EdgeLineDigest.asText()`) to the clipboard.

## Journal

`journal.html` is a personal bet log stored in IndexedDB on the visitor's device (entries with screenshot blobs). Nothing is uploaded. Export/import is a JSON file with images inlined as data URLs. It shares the calendar and stat tile components with the performance page. Accounts with sync are a backlog item.

## Deploy

Live at https://ajur21.github.io/edgeline-ai/ from the public repo https://github.com/ajur21/edgeline-ai. Every push to `main` runs `.github/workflows/pages.yml`, which publishes the repository root to GitHub Pages (no build step). To ship a change: run both checks, commit, `git push`. `node_modules/` and `screenshots/` are ignored and never deployed.

## Known placeholders to replace

- Brand name "EdgeLine AI" and the inline SVG mark (header and footer of each page).
- Pricing tiers and prices on `index.html` (labelled "Sample pricing").
- FAQ answer about sportsbooks is generic copy; confirm it matches the real odds feed.
- Footer links: About, Terms, Privacy, Contact (all `href="#"`).
- All sign-up / plan buttons (`href="#"`); there is no backend, auth or payments.
- `data/picks.js` and `data/performance.js` are sample until the pipeline runs.

## Suggested backlog

1. ~~Wire real picks and results~~ done: see Data pipeline. Remaining: add the `ODDS_API_KEY` secret and run the workflow once.
2. Account sign-up / login and plan checkout (needs a backend; out of scope for the static site).
3. Email capture on the Free plan.
3b. Accounts with sync for the journal (currently device-only), and a shared parlay link.
3c. CLV by confidence tier and by sport on the performance page (the per-pick `clv` is already in the log); steam / reverse-line-movement flags from `history`; Kelly stake sizing from a stored bankroll.
4. Terms, privacy and responsible-gambling pages.
5. Social preview image (`og:image`); tags and favicon are in place.
6. ~~Deploy~~ done: GitHub Pages via Actions (see Deploy). A custom domain is the remaining step: add a CNAME in the repo settings.
