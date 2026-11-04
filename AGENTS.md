# EdgeLine AI — agent brief

Read this first. It is the hand-off document for any agent or developer working on this site.

## What this is

A static marketing and product website for an AI sports betting picks service. Three pages, no framework, no build step. Open `index.html` in a browser or serve the folder from any static host.

"EdgeLine AI" is a placeholder brand. All copy, prices, picks and performance numbers are placeholders and are labelled "Sample data" in the UI. Do not remove those labels until real data is wired in.

## File map

```
index.html           Landing: hero + today's board, how it works, top 3 picks, pricing, FAQ
picks.html           All picks with filters (sport, market, confidence, min edge); card/table view
performance.html     Stat tiles, cumulative units line chart, units by sport bars, graded results table
css/styles.css       ALL styles. Design tokens live in :root at the top; dark theme in the two blocks below it
js/app.js            Loaded in <head>. Theme toggle, nav state, odds math, pick card/table rendering. Exposes window.EdgeLine
js/charts.js         Dependency-free SVG line + bar charts with tooltips, keyboard nav, table twins. Exposes window.EdgeLineCharts
js/space.js          Canvas space backdrop (parallax stars, nebulae, flare, shooting stars, vignette); light theme = daylight sky; still frame under reduced motion
data/picks.js        -> window.PICKS_DATA  { sample, source, generatedAt, picks: [...] }   (sample until the pipeline runs)
data/performance.js  -> window.PERF_DATA   { sample, asOf, record, units, roi, avgEdge, daily, bySport, recent }
data/picks-log.json  Every pick ever published, with grading; the pipeline's source of truth (created on first real run)
scripts/update-data.js  Data pipeline: The Odds API -> de-vigged consensus -> edges -> log -> grade -> rewrite the two data files
scripts/data-test.js    Offline pipeline test against scripts/fixtures/ (run by `npm test`)
scripts/screenshot.js Playwright render check (see Verify)
scripts/behavior.js  Playwright behaviour checks: nav state, filters, chart edge cases, keyboard access (see Verify)
package.json         Dev-only: `npm run check` runs the render check; Playwright is the only dependency
README.md            Human-facing overview and customisation notes
```

The header and footer are duplicated verbatim in all three HTML files. If you change one, change all three.

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

`scripts/update-data.js` is the "backend". `.github/workflows/update-data.yml` runs it daily at 20:30 UTC (late afternoon Eastern, when soft books lag line moves and edges actually exist; a morning run found none) and on demand, commits `data/`, and redeploys. It needs the `ODDS_API_KEY` repository secret (a key from https://the-odds-api.com; the free tier is 500 requests/month).

How a pick is made (all in `update-data.js`, tunable in `RULES`):
1. For each active sport (on its game days: NBA/NHL/MLB daily, NFL Wed/Sat/Sun/Mon, soccer Fri-Sun), fetch moneyline, spread and total prices for ten named bookmakers: Pinnacle plus nine bettable U.S. books (ten bookmakers cost the same as one region: 3 requests per sport, 2 for soccer).
2. Per event and market, group books by exact line and keep the largest group (at least 3 books). The **fair** probability is Pinnacle's de-vigged price for that line (the sharp reference); if Pinnacle does not price it, the de-vigged average of the other books stands in. The site calls this "Fair"; the data field is still `modelProb`.
3. For each outcome, take the best price among the bettable books (never Pinnacle). Edge = fair − implied(best price). Edge of 1 point or more becomes a pick (Lean; about +2% expected value at even odds); 2 is Medium; 3.5 is High. Each pick records `ev` (expected profit per unit). Only one side of a market can be picked.
4. At most 4 picks per sport and 12 per run; only events starting within 36 hours. A pick is logged once per event+market+outcome+line, at the price seen.
5. Pending picks whose events started 3+ hours ago are graded from the scores endpoint (2 requests per sport with pending picks). Win pays the profit at the logged odds for 1 unit; loss is −1; push 0. Ungraded after 7 days becomes `void` and is excluded.
6. `performance.js` summarises graded picks from the last 30 days by event date (Eastern). `picks.js` is every pending pick whose event is still ahead.

Request budget: 3 per sport fetched (2 for soccer) plus 2 per sport with pending picks for grading: about 10 on a weekday, 20 on a weekend day, roughly 350 a month against the free tier's 500. The script stops fetching odds when the API reports fewer than 25 requests left. `node scripts/update-data.js --verbose --out /tmp/x` prints every line's best edge (costs real requests). Sample data stays in place (flagged `sample: true`) until the first real run; the UI hides "Sample" labels when `sample` is false.

To run locally: `ODDS_API_KEY=... npm run data`. To test without the network: `npm test` (uses `scripts/fixtures/`).

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
4. Terms, privacy and responsible-gambling pages.
5. Social preview image (`og:image`); tags and favicon are in place.
6. ~~Deploy~~ done: GitHub Pages via Actions (see Deploy). A custom domain is the remaining step: add a CNAME in the repo settings.
