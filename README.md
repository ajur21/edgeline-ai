# EdgeLine AI — static site

A static HTML/CSS/JS website for an AI sports betting picks product. No build step, no framework.
Open `index.html` in a browser, or serve the folder with any static host (GitHub Pages, Netlify, Cloudflare Pages, S3).

"EdgeLine AI" and all copy, prices and numbers are placeholders.

Live: https://ajur21.github.io/edgeline-ai/ (deploys from `main` via GitHub Actions).

## Pages

| File | What it is |
|---|---|
| `index.html` | Landing page: odds ticker, hero with today's board, the edge field (every priced side of tonight's market as a star against the 1-point bar), play of the day, parlay of the day, how it works with an edge calculator, top three picks, pricing, FAQ |
| `picks.html` | Best parlays ranked by expected value, today's picks with filters and sort, card or table view, line shopping across every book, a parlay builder, and the market board: every market priced against the sharp line, pick or not |
| `digest.html` | The daily digest: one page with the whole slate by tip-off time, the play and parlay of the day, the top three by expected value, and live scores once games start. Print it, save it as a PDF, or copy it as text |
| `performance.html` | Track record: stat tiles, play and parlay records, closing line value, profit calendar, cumulative units chart, units by sport, recent graded picks |
| `props.html` | NBA props research: tonight's players with faces, form, splits, a line checker, confluence signals and game logs (stats from ESPN's public API; no betting lines) |
| `journal.html` | Your own bet log with screenshots and a profit calendar, stored on your device |

## Structure

```
css/styles.css      design tokens (colors, fonts, radii) and all styles; light and dark themes
scripts/screenshot.js  Playwright render check: `npm install && npx playwright install chromium` once, then `npm run check`
js/app.js           theme toggle, odds math (implied probability, edge), pick card and table rendering, line shopping
js/live.js          live in-game status from ESPN's public scoreboard, polled in the browser while games are on
js/charts.js        dependency-free SVG line and bar charts with hover tooltips and table views
js/space.js         canvas space backdrop: parallax stars, nebulae, shooting stars; dark by default, light = daylight sky
js/teams.js         team logos, matchup strips (the picked side lit in its colour), card tints and player faces, from the two files below
data/teams.js       164 teams in six leagues (NBA, NFL, MLB, NHL, Premier League, La Liga): names, abbreviations, logos, colours -> window.TEAMS_DATA; `npm run teams`
data/faces.js       NBA rotation players and the Out list with season points and injury status -> window.FACES_DATA (written with the props refresh)
data/picks.js       SAMPLE picks  -> window.PICKS_DATA
data/performance.js SAMPLE results -> window.PERF_DATA
data/market.js      every priced market from the last run -> window.MARKET_DATA (the site falls back to it so no page is ever empty)
scripts/feeds.js    writes picks.ics (calendar subscription) and feed.xml (RSS) from the data files; `npm run feeds`
picks.ics, feed.xml the subscriptions, rebuilt by the workflow on every data change
```

## Subscribing

No account, no email list. The home page's Subscribe section offers two feeds the pipeline rebuilds on every data change:

- `picks.ics`: a calendar subscription (webcal link for Apple Calendar and Outlook; Google Calendar takes the URL under Other calendars, From URL). One event per pick at tip-off with the price, book, fair probability, edge and breakdown, an alert 30 minutes before the start, and the result written into the same event after the game. On a night nothing clears the bar, one all-day event says so and names the closest side.
- `feed.xml`: RSS for any reader, Slack's `/feed subscribe`, or an RSS-to-email service. One item per pick, one per grade, one per slate, newest first.

## Real data

Every pick shows the price at every book on its line (best first, with how many still clear the 1-point bar and a flag when only one does), and once its game starts, the live score and where the pick stands. After grading, each pick is scored for closing line value against DraftKings' closing number (published free by ESPN after every game): whether the price we published beat the close, or for spreads and totals that closed on a different number, whether the line moved toward the pick. Between odds runs, a light job refreshes DraftKings' open and current numbers every two hours so each breakdown shows the market's drift. A second feed, SportsGameOdds' free tier (set the `SGO_API_KEY` secret), adds nine books' prices on every pick's line, the whole market's move since the open, free final scores, and a nine-book closing number for CLV; The Odds API keeps the sharp anchor and finds the edges. The performance page shows the average and the beat rate.

Everything is ranked likeliest first: by the fair probability of the side hitting, with the edge as the tiebreaker. Each card carries its rank ("#1 · Likeliest"), a probability bar (the fill is the fair probability, the tick is what the price implies, the hairline is a coin flip) and Fair as the lead number; the picks page and the market board let you switch to biggest edge, longest odds or start time.

Every pick, market row, parlay leg and digest line shows the matchup as two team logos, the side the pick is on lit and ringed in the team's colour and the other side dimmed, so a board scans like a scoreboard. The card back and the breakdown add "Names to know": the players ESPN lists as Out or day-to-day first, then the top scorers, each with a face. Logos and photos come from ESPN's CDN (resized on their side, with a text monogram if an image fails) and are credited in the footer; they are the leagues' marks and must be licensed before the site is sold.

Every pick carries a full breakdown: why it sits at its confidence tier, what supports it and what could go wrong, with the injury report for both teams, rest and back-to-backs, venue, records, probable pitchers, kickoff weather for outdoor games and line movement since the pick was logged. Open it from any card's "Full breakdown" button.

`scripts/update-data.js` pulls prices from [The Odds API](https://the-odds-api.com), de-vigs every book into a consensus "fair" probability, flags prices that sit below it (the edge), grades finished picks from final scores, and rewrites the two data files. A GitHub Actions workflow runs it daily once the `ODDS_API_KEY` repository secret exists. Until then the site shows labelled sample data. See CLAUDE.md for the rules and request budget.

## Plugging in a different model

The pages read `window.PICKS_DATA` and `window.PERF_DATA`. Either:

1. Have your backend write `data/picks.js` and `data/performance.js` in the same shape on a schedule, or
2. Replace the `<script src="data/...">` tags with a `fetch()` to your API that resolves to the same JSON, then call the render code.

Pick shape:

```js
{ id, sport, league, event, start, market, pick, odds /* American */, modelProb /* 0–1 */, confidence /* High|Medium|Lean */, rationale }
```

Edge is computed on the client as `modelProb - impliedProb(odds)`.

## Customising

- Brand name: search and replace `EdgeLine AI`. The mark is an inline SVG in each page's header and footer.
- Colors and fonts: edit the `:root` tokens at the top of `css/styles.css`. Dark mode values live in the two dark blocks directly below.
- Fonts load from Google Fonts (Sora for headlines, Inter for body, Oswald for labels and the ticker, JetBrains Mono for numbers) with system fallbacks.
- Sport colors, accent colors and the 3D button edge are tokens too (`--sport-*`, `--accent-2/3/4`, `--edge`). Hover tilt, scroll reveal and button press effects switch off under `prefers-reduced-motion`.

## Checking changes

`npm run check` renders every page at desktop and phone width in light and dark, fails on console errors or horizontal overflow, and writes screenshots to `screenshots/`. `npm test` runs behaviour checks for nav state, filters, chart edge cases and keyboard access.

## Compliance

The footer carries a responsible-gambling notice, a 21+ marker and the 1-800-GAMBLER helpline. Keep these and add any disclosures your jurisdiction requires before publishing.
