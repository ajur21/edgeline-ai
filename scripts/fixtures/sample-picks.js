/* SAMPLE DATA (test fixture, not real picks). Shape matches what scripts/update-data.js writes. */
window.PICKS_DATA = {
  "sample": true,
  "generatedAt": "2026-11-04T09:00:00-05:00",
  "picks": [
    {
      "id": "p1",
      "sport": "NFL",
      "league": "NFL",
      "event": "Kansas City @ Buffalo",
      "start": "Sun 4:25 PM ET",
      "market": "Spread",
      "pick": "Buffalo -2.5",
      "odds": -110,
      "modelProb": 0.585,
      "confidence": "High",
      "rationale": "Model favors the home team's rest advantage and pass-rush matchup; line has moved toward Buffalo since open.",
      "factors": [
        "Home side on 10 days' rest",
        "Pass-rush vs. weak right tackle",
        "Line moved 1.5 toward Buffalo"
      ],
      "book": "DraftKings",
      "prices": {
        "DraftKings": -110,
        "FanDuel": -120,
        "BetMGM": -125,
        "Caesars": -115,
        "BetRivers": -120
      },
      "ev": 0.1168
    },
    {
      "id": "p2",
      "sport": "NBA",
      "league": "NBA",
      "event": "Boston @ Milwaukee",
      "start": "Tonight 8:00 PM ET",
      "market": "Total",
      "pick": "Over 226.5",
      "odds": -108,
      "modelProb": 0.567,
      "confidence": "High",
      "rationale": "Both teams rank top-six in pace over the last ten games; projected total sits 4 points above the market.",
      "factors": [
        "Both top-6 in pace, last 10",
        "Projected total 230.5",
        "No key rotation players out"
      ],
      "book": "FanDuel",
      "prices": {
        "DraftKings": -108,
        "FanDuel": -108,
        "BetMGM": -113,
        "Caesars": -118,
        "BetRivers": -123
      },
      "ev": 0.092
    },
    {
      "id": "p3",
      "sport": "NHL",
      "league": "NHL",
      "event": "Toronto @ Colorado",
      "start": "Tonight 9:00 PM ET",
      "market": "Moneyline",
      "pick": "Colorado ML",
      "odds": -135,
      "modelProb": 0.615,
      "confidence": "Medium",
      "rationale": "Goalie confirmation tilts the expected goals model; altitude and back-to-back effects included.",
      "factors": [
        "Starting goalie confirmed",
        "Altitude edge at home",
        "Opponent on a back-to-back"
      ],
      "book": "BetMGM",
      "prices": {
        "DraftKings": -135,
        "FanDuel": -140,
        "BetMGM": -135,
        "Caesars": -150,
        "BetRivers": -140
      },
      "ev": 0.0706
    },
    {
      "id": "p4",
      "sport": "MLB",
      "league": "MLB",
      "event": "LA Dodgers @ Atlanta",
      "start": "Tonight 7:20 PM ET",
      "market": "Moneyline",
      "pick": "Atlanta ML",
      "odds": 120,
      "modelProb": 0.495,
      "confidence": "Medium",
      "rationale": "Market overweights the road starter's season ERA; the model's pitch-level projection is closer to even.",
      "factors": [
        "Road starter's ERA overstated",
        "Pitch-level model near even",
        "Plus money on a coin flip"
      ],
      "book": "Caesars",
      "prices": {
        "DraftKings": 115,
        "FanDuel": 110,
        "BetMGM": 105,
        "Caesars": 120,
        "BetRivers": 110
      },
      "ev": 0.089
    },
    {
      "id": "p5",
      "sport": "Soccer",
      "league": "Premier League",
      "event": "Arsenal vs. Liverpool",
      "start": "Sat 12:30 PM ET",
      "market": "Total",
      "pick": "Over 2.5 goals",
      "odds": -115,
      "modelProb": 0.578,
      "confidence": "Medium",
      "rationale": "Expected-goals simulation produces 2.5+ in 58% of runs; both sides pressing high in recent fixtures.",
      "factors": [
        "2.5+ goals in 58% of sims",
        "Both sides pressing high",
        "Four straight overs for Arsenal"
      ],
      "book": "BetRivers",
      "prices": {
        "DraftKings": -125,
        "FanDuel": -130,
        "BetMGM": -120,
        "Caesars": -125,
        "BetRivers": -115
      },
      "ev": 0.0806
    },
    {
      "id": "p6",
      "sport": "NBA",
      "league": "NBA",
      "event": "Denver @ Phoenix",
      "start": "Tonight 10:00 PM ET",
      "market": "Spread",
      "pick": "Denver +3.5",
      "odds": -110,
      "modelProb": 0.552,
      "confidence": "Lean",
      "rationale": "Injury report updated this morning; the model's lineup-adjusted rating moves the fair line to +1.5.",
      "factors": [
        "Fresh injury report this morning",
        "Lineup-adjusted fair line +1.5",
        "Market slow to move"
      ],
      "book": "DraftKings",
      "prices": {
        "DraftKings": -110,
        "FanDuel": -115,
        "BetMGM": -120,
        "Caesars": -125,
        "BetRivers": -115
      },
      "ev": 0.0538
    },
    {
      "id": "p7",
      "sport": "NFL",
      "league": "NFL",
      "event": "Dallas @ Philadelphia",
      "start": "Sun 1:00 PM ET",
      "market": "Total",
      "pick": "Under 48.5",
      "odds": -112,
      "modelProb": 0.561,
      "confidence": "Medium",
      "rationale": "Wind forecast above 15 mph suppresses deep passing; historical totals in similar conditions skew under.",
      "factors": [
        "Wind forecast 15+ mph",
        "Deep passing suppressed",
        "Similar conditions skew under"
      ],
      "book": "FanDuel",
      "prices": {
        "DraftKings": -117,
        "FanDuel": -112,
        "BetMGM": -127,
        "Caesars": -117,
        "BetRivers": -122
      },
      "ev": 0.0619
    },
    {
      "id": "p8",
      "sport": "NHL",
      "league": "NHL",
      "event": "NY Rangers @ Boston",
      "start": "Tonight 7:00 PM ET",
      "market": "Total",
      "pick": "Under 5.5",
      "odds": -120,
      "modelProb": 0.588,
      "confidence": "Medium",
      "rationale": "Both starting goalies rank top-ten in goals saved above expected over the last 30 days.",
      "factors": [
        "Both goalies top-10 in GSAx",
        "Low-event matchup history",
        "Totals market a touch high"
      ],
      "book": "BetMGM",
      "prices": {
        "DraftKings": -130,
        "FanDuel": -135,
        "BetMGM": -120,
        "Caesars": -130,
        "BetRivers": -135
      },
      "ev": 0.078
    },
    {
      "id": "p9",
      "sport": "MLB",
      "league": "MLB",
      "event": "NY Yankees @ Houston",
      "start": "Tonight 8:10 PM ET",
      "market": "Run line",
      "pick": "Yankees -1.5",
      "odds": 145,
      "modelProb": 0.455,
      "confidence": "Lean",
      "rationale": "Plus-money run line with a favorable bullpen matchup; model edge is thin, so sized as a lean.",
      "factors": [
        "Bullpen matchup favors Yankees",
        "Plus money on the run line",
        "Sized as a lean: thin edge"
      ],
      "book": "Caesars",
      "prices": {
        "DraftKings": 130,
        "FanDuel": 140,
        "BetMGM": 135,
        "Caesars": 145,
        "BetRivers": 140
      },
      "ev": 0.1148
    },
    {
      "id": "p10",
      "sport": "Soccer",
      "league": "La Liga",
      "event": "Real Madrid vs. Sevilla",
      "start": "Sun 3:00 PM ET",
      "market": "Moneyline",
      "pick": "Real Madrid ML",
      "odds": -190,
      "modelProb": 0.695,
      "confidence": "High",
      "rationale": "Simulation gives the home side a 69.5% win probability versus 65.5% implied by the price.",
      "factors": [
        "69.5% in simulation",
        "Home form: 7 wins in 8",
        "Sevilla missing two starters"
      ],
      "book": "BetRivers",
      "prices": {
        "DraftKings": -195,
        "FanDuel": -200,
        "BetMGM": -205,
        "Caesars": -195,
        "BetRivers": -190
      },
      "ev": 0.0608
    },
    {
      "id": "p11",
      "sport": "NBA",
      "league": "NBA",
      "event": "Golden State @ Sacramento",
      "start": "Tonight 10:00 PM ET",
      "market": "Moneyline",
      "pick": "Sacramento ML",
      "odds": 105,
      "modelProb": 0.515,
      "confidence": "Lean",
      "rationale": "Home underdog with a positive net rating in the last ten; the model marks the fair price near even.",
      "factors": [
        "Positive net rating, last 10",
        "Home dog near even",
        "Fair price around -105"
      ],
      "book": "DraftKings",
      "prices": {
        "DraftKings": 105,
        "FanDuel": 90,
        "BetMGM": 100,
        "Caesars": 95,
        "BetRivers": 90
      },
      "ev": 0.0557
    },
    {
      "id": "p12",
      "sport": "NFL",
      "league": "NFL",
      "event": "San Francisco @ Seattle",
      "start": "Sun 4:05 PM ET",
      "market": "Spread",
      "pick": "San Francisco -3",
      "odds": -105,
      "modelProb": 0.548,
      "confidence": "Lean",
      "rationale": "Key number at 3 with a reduced price; the model's fair line is -4, giving modest value at -105.",
      "factors": [
        "Key number 3 at a cheap price",
        "Model fair line -4",
        "Seattle thin at corner"
      ],
      "book": "FanDuel",
      "prices": {
        "DraftKings": -120,
        "FanDuel": -105,
        "BetMGM": -115,
        "Caesars": -120,
        "BetRivers": -110
      },
      "ev": 0.0699
    }
  ],
  "playOfDay": {
    "id": "p1",
    "sport": "NFL",
    "league": "NFL",
    "event": "Kansas City @ Buffalo",
    "start": "Sun 4:25 PM ET",
    "market": "Spread",
    "pick": "Buffalo -2.5",
    "odds": -110,
    "modelProb": 0.585,
    "confidence": "High",
    "rationale": "Model favors the home team's rest advantage and pass-rush matchup; line has moved toward Buffalo since open.",
    "factors": [
      "Home side on 10 days' rest",
      "Pass-rush vs. weak right tackle",
      "Line moved 1.5 toward Buffalo"
    ],
    "book": "DraftKings",
    "prices": {
      "DraftKings": -110,
      "FanDuel": -120,
      "BetMGM": -125,
      "Caesars": -115,
      "BetRivers": -120
    },
    "ev": 0.1168,
    "started": false,
    "status": "pending",
    "result": null
  },
  "parlayOfDay": {
    "id": "parlay-sample",
    "date": "2026-11-04",
    "book": "Caesars",
    "odds": 908,
    "decimal": 10.077,
    "fairProb": 0.1318,
    "ev": 0.3277,
    "status": "pending",
    "result": null,
    "legs": [
      {
        "id": "p1",
        "pick": "Buffalo -2.5",
        "event": "Kansas City @ Buffalo",
        "sport": "NFL",
        "price": -115,
        "started": false,
        "result": null
      },
      {
        "id": "p4",
        "pick": "Atlanta ML",
        "event": "LA Dodgers @ Atlanta",
        "sport": "MLB",
        "price": 120,
        "started": false,
        "result": null
      },
      {
        "id": "p9",
        "pick": "Yankees -1.5",
        "event": "NY Yankees @ Houston",
        "sport": "MLB",
        "price": 145,
        "started": false,
        "result": null
      }
    ]
  }
};
