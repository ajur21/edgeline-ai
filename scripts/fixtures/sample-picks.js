/* ==========================================================================
   SAMPLE DATA — not real picks.
   Replace this file with the output of your model, or swap the <script> tag
   that loads it for a fetch() that resolves to the same shape.
   Odds are American format. modelProb is the model's win probability (0–1).
   factors is an optional list of 2–3 short reasons shown on the back of the card.
   ========================================================================== */
window.PICKS_DATA = {
  sample: true,
  generatedAt: "2026-11-04T09:00:00-05:00",
  picks: [
    { id: "p1", sport: "NFL", league: "NFL", event: "Kansas City @ Buffalo", start: "Sun 4:25 PM ET",
      market: "Spread", pick: "Buffalo -2.5", odds: -110, modelProb: 0.585, confidence: "High",
      rationale: "Model favors the home team's rest advantage and pass-rush matchup; line has moved toward Buffalo since open.",
      factors: ["Home side on 10 days' rest", "Pass-rush vs. weak right tackle", "Line moved 1.5 toward Buffalo"] },
    { id: "p2", sport: "NBA", league: "NBA", event: "Boston @ Milwaukee", start: "Tonight 8:00 PM ET",
      market: "Total", pick: "Over 226.5", odds: -108, modelProb: 0.567, confidence: "High",
      rationale: "Both teams rank top-six in pace over the last ten games; projected total sits 4 points above the market.",
      factors: ["Both top-6 in pace, last 10", "Projected total 230.5", "No key rotation players out"] },
    { id: "p3", sport: "NHL", league: "NHL", event: "Toronto @ Colorado", start: "Tonight 9:00 PM ET",
      market: "Moneyline", pick: "Colorado ML", odds: -135, modelProb: 0.615, confidence: "Medium",
      rationale: "Goalie confirmation tilts the expected goals model; altitude and back-to-back effects included.",
      factors: ["Starting goalie confirmed", "Altitude edge at home", "Opponent on a back-to-back"] },
    { id: "p4", sport: "MLB", league: "MLB", event: "LA Dodgers @ Atlanta", start: "Tonight 7:20 PM ET",
      market: "Moneyline", pick: "Atlanta ML", odds: +120, modelProb: 0.495, confidence: "Medium",
      rationale: "Market overweights the road starter's season ERA; the model's pitch-level projection is closer to even.",
      factors: ["Road starter's ERA overstated", "Pitch-level model near even", "Plus money on a coin flip"] },
    { id: "p5", sport: "Soccer", league: "Premier League", event: "Arsenal vs. Liverpool", start: "Sat 12:30 PM ET",
      market: "Total", pick: "Over 2.5 goals", odds: -115, modelProb: 0.578, confidence: "Medium",
      rationale: "Expected-goals simulation produces 2.5+ in 58% of runs; both sides pressing high in recent fixtures.",
      factors: ["2.5+ goals in 58% of sims", "Both sides pressing high", "Four straight overs for Arsenal"] },
    { id: "p6", sport: "NBA", league: "NBA", event: "Denver @ Phoenix", start: "Tonight 10:00 PM ET",
      market: "Spread", pick: "Denver +3.5", odds: -110, modelProb: 0.552, confidence: "Lean",
      rationale: "Injury report updated this morning; the model's lineup-adjusted rating moves the fair line to +1.5.",
      factors: ["Fresh injury report this morning", "Lineup-adjusted fair line +1.5", "Market slow to move"] },
    { id: "p7", sport: "NFL", league: "NFL", event: "Dallas @ Philadelphia", start: "Sun 1:00 PM ET",
      market: "Total", pick: "Under 48.5", odds: -112, modelProb: 0.561, confidence: "Medium",
      rationale: "Wind forecast above 15 mph suppresses deep passing; historical totals in similar conditions skew under.",
      factors: ["Wind forecast 15+ mph", "Deep passing suppressed", "Similar conditions skew under"] },
    { id: "p8", sport: "NHL", league: "NHL", event: "NY Rangers @ Boston", start: "Tonight 7:00 PM ET",
      market: "Total", pick: "Under 5.5", odds: -120, modelProb: 0.588, confidence: "Medium",
      rationale: "Both starting goalies rank top-ten in goals saved above expected over the last 30 days.",
      factors: ["Both goalies top-10 in GSAx", "Low-event matchup history", "Totals market a touch high"] },
    { id: "p9", sport: "MLB", league: "MLB", event: "NY Yankees @ Houston", start: "Tonight 8:10 PM ET",
      market: "Run line", pick: "Yankees -1.5", odds: +145, modelProb: 0.455, confidence: "Lean",
      rationale: "Plus-money run line with a favorable bullpen matchup; model edge is thin, so sized as a lean.",
      factors: ["Bullpen matchup favors Yankees", "Plus money on the run line", "Sized as a lean: thin edge"] },
    { id: "p10", sport: "Soccer", league: "La Liga", event: "Real Madrid vs. Sevilla", start: "Sun 3:00 PM ET",
      market: "Moneyline", pick: "Real Madrid ML", odds: -190, modelProb: 0.695, confidence: "High",
      rationale: "Simulation gives the home side a 69.5% win probability versus 65.5% implied by the price.",
      factors: ["69.5% in simulation", "Home form: 7 wins in 8", "Sevilla missing two starters"] },
    { id: "p11", sport: "NBA", league: "NBA", event: "Golden State @ Sacramento", start: "Tonight 10:00 PM ET",
      market: "Moneyline", pick: "Sacramento ML", odds: +105, modelProb: 0.515, confidence: "Lean",
      rationale: "Home underdog with a positive net rating in the last ten; the model marks the fair price near even.",
      factors: ["Positive net rating, last 10", "Home dog near even", "Fair price around -105"] },
    { id: "p12", sport: "NFL", league: "NFL", event: "San Francisco @ Seattle", start: "Sun 4:05 PM ET",
      market: "Spread", pick: "San Francisco -3", odds: -105, modelProb: 0.548, confidence: "Lean",
      rationale: "Key number at 3 with a reduced price; the model's fair line is -4, giving modest value at -105.",
      factors: ["Key number 3 at a cheap price", "Model fair line -4", "Seattle thin at corner"] }
  ]
};
