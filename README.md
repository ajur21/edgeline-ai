# EdgeLine AI — static site

A static HTML/CSS/JS website for an AI sports betting picks product. No build step, no framework.
Open `index.html` in a browser, or serve the folder with any static host (GitHub Pages, Netlify, Cloudflare Pages, S3).

"EdgeLine AI" and all copy, prices and numbers are placeholders.

## Pages

| File | What it is |
|---|---|
| `index.html` | Landing page: hero with today's board, how it works, top three picks, pricing, FAQ |
| `picks.html` | Today's picks with filters (sport, market, confidence, minimum edge) and card or table view |
| `performance.html` | Track record: stat tiles, cumulative units chart, units by sport, recent graded picks |

## Structure

```
css/styles.css      design tokens (colors, fonts, radii) and all styles; light and dark themes
scripts/screenshot.js  Playwright render check: `npm install && npx playwright install chromium` once, then `npm run check`
js/app.js           theme toggle, odds math (implied probability, edge), pick card and table rendering
js/charts.js        dependency-free SVG line and bar charts with hover tooltips and table views
js/space.js         canvas space backdrop: parallax stars, nebulae, shooting stars; dark by default, light = daylight sky
data/picks.js       SAMPLE picks  -> window.PICKS_DATA
data/performance.js SAMPLE results -> window.PERF_DATA
```

## Plugging in a real model

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
