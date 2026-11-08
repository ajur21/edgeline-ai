/* The replay of past seasons against the closing price, and what the site calls its selections. Written by hand, not by
   the pipeline. The pages and scripts/feeds.js read it; everything works without it (the wording stays "leans" and the
   replay note keeps its sentence without the figures).

   call: "leans" (owner decision, 2026-11-05) or "picks". The one switch for the wording on every page, the digest and the
   feeds. A held-out replay of the game model over past seasons, priced at ESPN's closing odds, lost money in every
   league, so the site calls its selections leans until the live record beats the close. Flipping it back to "picks" is
   the owner's call, never automatic: set call to "picks" here and nothing else.

   leagues: the replay, one row per league: games replayed, selections made by today's rule, ROI at the close in percent
   and its standard error (one unit on every selection at the closing price). NHL 2024-25 on, NBA 2023-24 on, NFL 2024
   on; ESPN's free core odds (ESPN BET or DraftKings) for the close. Results only, no injuries (ESPN keeps no history). */
window.REPLAY_DATA = {
  "asOf": "2026-11-05",
  "call": "leans",
  "leagues": [
    { "league": "NHL", "seasons": "2024-25 on", "games": 2811, "picks": 883, "roiClose": -4.8, "se": 3.7 },
    { "league": "NBA", "seasons": "2023-24 on", "games": 3751, "picks": 2494, "roiClose": -7.9, "se": 2.3 },
    { "league": "NFL", "seasons": "2024 on", "games": 633, "picks": 253, "roiClose": -9.5, "se": 7.1 }
  ]
};
