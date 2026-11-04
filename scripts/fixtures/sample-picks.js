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
        "BetRivers": -120,
        "PointsBet": -105,
        "Unibet": -112
      },
      "ev": 0.1168,
      "away": "Kansas City",
      "home": "Buffalo",
      "marketKey": "spreads",
      "context": {
        "espnEventId": "x0",
        "venue": "Highmark Stadium, Orchard Park",
        "indoor": false,
        "records": {
          "Buffalo": {
            "overall": "5-2",
            "home": "3-0",
            "away": null
          },
          "Kansas City": {
            "overall": "4-3",
            "home": null,
            "away": "1-2"
          }
        },
        "probables": {},
        "injuries": {
          "Buffalo": [],
          "Kansas City": [
            {
              "name": "Key Forward",
              "pos": "F",
              "status": "Out",
              "type": "Knee",
              "detail": "Sprain",
              "returnDate": "2026-11-20",
              "note": "Out at least two weeks."
            }
          ]
        },
        "rest": {
          "Buffalo": {
            "restDays": 1,
            "b2b": true,
            "lastGame": "2026-11-03",
            "gamesLast7": 3
          },
          "Kansas City": {
            "restDays": 2,
            "b2b": false,
            "lastGame": "2026-11-02",
            "gamesLast7": 3
          }
        },
        "weather": {
          "summary": "Clear",
          "tempF": 48,
          "windMph": 6,
          "precipPct": 5,
          "source": "Open-Meteo",
          "city": "Buffalo, NY, USA"
        },
        "broadcast": "ESPN"
      },
      "breakdown": {
        "tier": "High",
        "tierWhy": "Edge of 6.1 points over the fair line. Lean starts at 1.0 points, Medium at 2.0 points, High at 3.5 points. Confidence is the size of the price edge only; the context below is what could move the result, not the number.",
        "price": "Model favors the home team's rest advantage and pass-rush matchup; line has moved toward Buffalo since open.",
        "support": [
          "Kansas City missing Key Forward (F), knee."
        ],
        "risks": [
          "No sharp anchor on this line: fair is the de-vigged average of the books, which is softer.",
          "Buffalo are on the second night of a back-to-back."
        ],
        "notes": [
          "Weather at kickoff: Clear, 48°F, wind 6 mph, 5% rain.",
          "Records: Kansas City 4-3 · Buffalo 5-2 · Highmark Stadium, Orchard Park."
        ],
        "verdict": "More working against this one than for it beyond the price; size down."
      },
      "movement": null,
      "dk": {
        "book": "DraftKings",
        "open": {
          "line": -1.5,
          "odds": -110,
          "fair": 0.5
        },
        "now": {
          "line": -2.5,
          "odds": -110,
          "fair": 0.5
        },
        "moved": "toward",
        "label": "DraftKings opened -1.5 (-110), now -2.5 (-110)"
      },
      "dkHistory": [
        {
          "at": "2026-11-04T17:00:00Z",
          "line": -1.5,
          "odds": -110,
          "fair": 0.5
        },
        {
          "at": "2026-11-04T21:00:00Z",
          "line": -2.5,
          "odds": -110,
          "fair": 0.5
        }
      ],
      "mkt": {
        "book": "Market consensus",
        "n": 7,
        "open": {
          "line": -1.5,
          "odds": -104
        },
        "now": {
          "line": -2.5,
          "odds": 102
        },
        "moved": "toward",
        "label": "The market (7 books) opened -1.5 (-104), now -2.5 (+102)"
      },
      "sgo": {
        "at": "2026-11-04T21:00:00Z",
        "n": 7,
        "best": {
          "book": "PointsBet",
          "odds": -105
        },
        "fair": 0.49,
        "vendorFair": 0.495,
        "open": {
          "line": -1.5,
          "odds": -104
        },
        "now": {
          "line": -2.5,
          "odds": 102
        }
      },
      "sgoHistory": [
        {
          "at": "2026-11-04T17:00:00Z",
          "fair": 0.5,
          "line": -1.5,
          "odds": -104,
          "best": -110,
          "n": 7
        },
        {
          "at": "2026-11-04T19:00:00Z",
          "fair": 0.495,
          "line": -2.5,
          "odds": 100,
          "best": -108,
          "n": 7
        },
        {
          "at": "2026-11-04T21:00:00Z",
          "fair": 0.49,
          "line": -2.5,
          "odds": 102,
          "best": -105,
          "n": 7
        }
      ]
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
      "ev": 0.092,
      "away": "Boston",
      "home": "Milwaukee",
      "marketKey": "totals",
      "context": {
        "espnEventId": "x1",
        "venue": "Arena",
        "indoor": true,
        "records": {
          "Milwaukee": {
            "overall": "5-2",
            "home": "3-0",
            "away": null
          },
          "Boston": {
            "overall": "4-3",
            "home": null,
            "away": "1-2"
          }
        },
        "probables": {},
        "injuries": {
          "Milwaukee": [
            {
              "name": "Starting Guard",
              "pos": "G",
              "status": "Questionable",
              "type": "Ankle",
              "detail": "Sprain",
              "returnDate": null,
              "note": "Listed questionable; will test it pregame."
            }
          ],
          "Boston": []
        },
        "rest": {
          "Milwaukee": {
            "restDays": 3,
            "b2b": false,
            "lastGame": "2026-11-03",
            "gamesLast7": 3
          },
          "Boston": {
            "restDays": 2,
            "b2b": false,
            "lastGame": "2026-11-02",
            "gamesLast7": 3
          }
        },
        "weather": null,
        "broadcast": "ESPN"
      },
      "breakdown": {
        "tier": "High",
        "tierWhy": "Edge of 4.8 points over the fair line. Lean starts at 1.0 points, Medium at 2.0 points, High at 3.5 points. Confidence is the size of the price edge only; the context below is what could move the result, not the number.",
        "price": "Both teams rank top-six in pace over the last ten games; projected total sits 4 points above the market.",
        "support": [
          "Fair line comes from Pinnacle's de-vigged price, the sharpest public market.",
          "6 books price this exact line, so the fair number is well established.",
          "The sharp line has moved toward this side since it was logged (fair 56.7% → 57.9%).",
          "A better price is now available: -103 at FanDuel."
        ],
        "risks": [],
        "notes": [
          "Indoor venue; weather is not a factor.",
          "Records: Boston 4-3 · Milwaukee 5-2 · Arena."
        ],
        "verdict": "The context lines up with the price."
      },
      "movement": {
        "loggedOdds": -108,
        "loggedFair": 0.567,
        "currentOdds": -103,
        "currentBook": "FanDuel",
        "currentFair": 0.579,
        "currentEdge": 0.059769230769230686,
        "checkedAt": "2026-11-04T16:00:00Z",
        "history": [
          {
            "at": "2026-11-04T12:00:00Z",
            "odds": -108,
            "fair": 0.567
          }
        ]
      }
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
      "ev": 0.0706,
      "away": "Toronto",
      "home": "Colorado",
      "marketKey": "h2h",
      "context": {
        "espnEventId": "x2",
        "venue": "Arena",
        "indoor": true,
        "records": {
          "Colorado": {
            "overall": "5-2",
            "home": "3-0",
            "away": null
          },
          "Toronto": {
            "overall": "4-3",
            "home": null,
            "away": "1-2"
          }
        },
        "probables": {},
        "injuries": {
          "Colorado": [],
          "Toronto": []
        },
        "rest": {
          "Colorado": {
            "restDays": 3,
            "b2b": false,
            "lastGame": "2026-11-03",
            "gamesLast7": 3
          },
          "Toronto": {
            "restDays": 2,
            "b2b": false,
            "lastGame": "2026-11-02",
            "gamesLast7": 3
          }
        },
        "weather": null,
        "broadcast": "ESPN"
      },
      "breakdown": {
        "tier": "Medium",
        "tierWhy": "Edge of 4.1 points over the fair line. Lean starts at 1.0 points, Medium at 2.0 points, High at 3.5 points. Confidence is the size of the price edge only; the context below is what could move the result, not the number.",
        "price": "Goalie confirmation tilts the expected goals model; altitude and back-to-back effects included.",
        "support": [
          "Fair line comes from Pinnacle's de-vigged price, the sharpest public market.",
          "7 books price this exact line, so the fair number is well established.",
          "Colorado are rested: 3 days since their last game."
        ],
        "risks": [],
        "notes": [
          "Indoor venue; weather is not a factor.",
          "Records: Toronto 4-3 · Colorado 5-2 · Arena."
        ],
        "verdict": "The context lines up with the price."
      },
      "movement": null
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
      "ev": 0.089,
      "away": "LA Dodgers",
      "home": "Atlanta",
      "marketKey": "h2h",
      "context": {
        "espnEventId": "x3",
        "venue": "Highmark Stadium, Orchard Park",
        "indoor": false,
        "records": {
          "Atlanta": {
            "overall": "5-2",
            "home": "3-0",
            "away": null
          },
          "LA Dodgers": {
            "overall": "4-3",
            "home": null,
            "away": "1-2"
          }
        },
        "probables": {
          "Atlanta": "Spencer Strider (ERA 2.91)",
          "LA Dodgers": "Yoshinobu Yamamoto (ERA 2.40)"
        },
        "injuries": {
          "Atlanta": [
            {
              "name": "Starting Guard",
              "pos": "G",
              "status": "Questionable",
              "type": "Ankle",
              "detail": "Sprain",
              "returnDate": null,
              "note": "Listed questionable; will test it pregame."
            }
          ],
          "LA Dodgers": [
            {
              "name": "Key Forward",
              "pos": "F",
              "status": "Out",
              "type": "Knee",
              "detail": "Sprain",
              "returnDate": "2026-11-20",
              "note": "Out at least two weeks."
            }
          ]
        },
        "rest": {
          "Atlanta": {
            "restDays": 3,
            "b2b": false,
            "lastGame": "2026-11-03",
            "gamesLast7": 3
          },
          "LA Dodgers": {
            "restDays": 2,
            "b2b": false,
            "lastGame": "2026-11-02",
            "gamesLast7": 3
          }
        },
        "weather": {
          "summary": "Rain",
          "tempF": 48,
          "windMph": 18,
          "precipPct": 70,
          "source": "Open-Meteo",
          "city": "Buffalo, NY, USA"
        },
        "broadcast": "ESPN"
      },
      "breakdown": {
        "tier": "Medium",
        "tierWhy": "Edge of 4.0 points over the fair line. Lean starts at 1.0 points, Medium at 2.0 points, High at 3.5 points. Confidence is the size of the price edge only; the context below is what could move the result, not the number.",
        "price": "Market overweights the road starter's season ERA; the model's pitch-level projection is closer to even.",
        "support": [
          "8 books price this exact line, so the fair number is well established.",
          "The sharp line has moved toward this side since it was logged (fair 49.5% → 50.7%).",
          "A better price is now available: +125 at Caesars.",
          "LA Dodgers missing Key Forward (F), knee.",
          "Atlanta are rested: 3 days since their last game."
        ],
        "risks": [
          "No sharp anchor on this line: fair is the de-vigged average of the books, which is softer.",
          "Atlanta listed Starting Guard (G), ankle as questionable.",
          "Weather at kickoff: Rain, 48°F, wind 18 mph, 70% rain. Rough conditions add variance."
        ],
        "notes": [
          "Probable pitchers: Atlanta Spencer Strider (ERA 2.91) · Dodgers Yoshinobu Yamamoto (ERA 2.40).",
          "Records: LA Dodgers 4-3 · Atlanta 5-2 · Highmark Stadium, Orchard Park."
        ],
        "verdict": "The context lines up with the price."
      },
      "movement": {
        "loggedOdds": 120,
        "loggedFair": 0.495,
        "currentOdds": 125,
        "currentBook": "Caesars",
        "currentFair": 0.507,
        "currentEdge": 0.052454545454545476,
        "checkedAt": "2026-11-04T16:00:00Z",
        "history": [
          {
            "at": "2026-11-04T12:00:00Z",
            "odds": 120,
            "fair": 0.495
          }
        ]
      }
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
      "ev": 0.0806,
      "home": "Arsenal",
      "away": "Liverpool",
      "marketKey": "totals",
      "context": {
        "espnEventId": "x4",
        "venue": "Truist Park, Atlanta",
        "indoor": false,
        "records": {
          "Arsenal": {
            "overall": "5-2",
            "home": "3-0",
            "away": null
          },
          "Liverpool": {
            "overall": "4-3",
            "home": null,
            "away": "1-2"
          }
        },
        "probables": {},
        "injuries": {
          "Arsenal": [],
          "Liverpool": []
        },
        "rest": {
          "Arsenal": {
            "restDays": 1,
            "b2b": true,
            "lastGame": "2026-11-03",
            "gamesLast7": 3
          },
          "Liverpool": {
            "restDays": 2,
            "b2b": false,
            "lastGame": "2026-11-02",
            "gamesLast7": 3
          }
        },
        "weather": {
          "summary": "Clear",
          "tempF": 48,
          "windMph": 6,
          "precipPct": 5,
          "source": "Open-Meteo",
          "city": "Buffalo, NY, USA"
        },
        "broadcast": "ESPN"
      },
      "breakdown": {
        "tier": "Medium",
        "tierWhy": "Edge of 4.3 points over the fair line. Lean starts at 1.0 points, Medium at 2.0 points, High at 3.5 points. Confidence is the size of the price edge only; the context below is what could move the result, not the number.",
        "price": "Expected-goals simulation produces 2.5+ in 58% of runs; both sides pressing high in recent fixtures.",
        "support": [
          "Fair line comes from Pinnacle's de-vigged price, the sharpest public market."
        ],
        "risks": [
          "Arsenal on a back-to-back; tired legs lean under."
        ],
        "notes": [
          "Weather at kickoff: Clear, 48°F, wind 6 mph, 5% rain.",
          "Records: Liverpool 4-3 · Arsenal 5-2 · Truist Park, Atlanta."
        ],
        "verdict": "Context is neutral; the price edge carries the pick."
      },
      "movement": null
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
      "ev": 0.0538,
      "away": "Denver",
      "home": "Phoenix",
      "marketKey": "spreads",
      "context": {
        "espnEventId": "x5",
        "venue": "Arena",
        "indoor": true,
        "records": {
          "Phoenix": {
            "overall": "5-2",
            "home": "3-0",
            "away": null
          },
          "Denver": {
            "overall": "4-3",
            "home": null,
            "away": "1-2"
          }
        },
        "probables": {},
        "injuries": {
          "Phoenix": [
            {
              "name": "Starting Guard",
              "pos": "G",
              "status": "Questionable",
              "type": "Ankle",
              "detail": "Sprain",
              "returnDate": null,
              "note": "Listed questionable; will test it pregame."
            }
          ],
          "Denver": []
        },
        "rest": {
          "Phoenix": {
            "restDays": 3,
            "b2b": false,
            "lastGame": "2026-11-03",
            "gamesLast7": 3
          },
          "Denver": {
            "restDays": 2,
            "b2b": false,
            "lastGame": "2026-11-02",
            "gamesLast7": 3
          }
        },
        "weather": null,
        "broadcast": "ESPN"
      },
      "breakdown": {
        "tier": "Lean",
        "tierWhy": "Edge of 2.8 points over the fair line. Lean starts at 1.0 points, Medium at 2.0 points, High at 3.5 points. Confidence is the size of the price edge only; the context below is what could move the result, not the number.",
        "price": "Injury report updated this morning; the model's lineup-adjusted rating moves the fair line to +1.5.",
        "support": [
          "Fair line comes from Pinnacle's de-vigged price, the sharpest public market.",
          "6 books price this exact line, so the fair number is well established.",
          "The sharp line has moved toward this side since it was logged (fair 55.2% → 56.4%).",
          "A better price is now available: -105 at DraftKings."
        ],
        "risks": [],
        "notes": [
          "Phoenix have Starting Guard (G), ankle questionable.",
          "Indoor venue; weather is not a factor.",
          "Records: Denver 4-3 · Phoenix 5-2 · Arena."
        ],
        "verdict": "The context lines up with the price."
      },
      "movement": {
        "loggedOdds": -110,
        "loggedFair": 0.552,
        "currentOdds": -105,
        "currentBook": "DraftKings",
        "currentFair": 0.5640000000000001,
        "currentEdge": 0.04019047619047622,
        "checkedAt": "2026-11-04T16:00:00Z",
        "history": [
          {
            "at": "2026-11-04T12:00:00Z",
            "odds": -110,
            "fair": 0.552
          }
        ]
      }
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
      "ev": 0.0619,
      "away": "Dallas",
      "home": "Philadelphia",
      "marketKey": "totals",
      "context": {
        "espnEventId": "x6",
        "venue": "Highmark Stadium, Orchard Park",
        "indoor": false,
        "records": {
          "Philadelphia": {
            "overall": "5-2",
            "home": "3-0",
            "away": null
          },
          "Dallas": {
            "overall": "4-3",
            "home": null,
            "away": "1-2"
          }
        },
        "probables": {},
        "injuries": {
          "Philadelphia": [],
          "Dallas": [
            {
              "name": "Key Forward",
              "pos": "F",
              "status": "Out",
              "type": "Knee",
              "detail": "Sprain",
              "returnDate": "2026-11-20",
              "note": "Out at least two weeks."
            }
          ]
        },
        "rest": {
          "Philadelphia": {
            "restDays": 3,
            "b2b": false,
            "lastGame": "2026-11-03",
            "gamesLast7": 3
          },
          "Dallas": {
            "restDays": 2,
            "b2b": false,
            "lastGame": "2026-11-02",
            "gamesLast7": 3
          }
        },
        "weather": {
          "summary": "Clear",
          "tempF": 48,
          "windMph": 6,
          "precipPct": 5,
          "source": "Open-Meteo",
          "city": "Buffalo, NY, USA"
        },
        "broadcast": "ESPN"
      },
      "breakdown": {
        "tier": "Medium",
        "tierWhy": "Edge of 3.3 points over the fair line. Lean starts at 1.0 points, Medium at 2.0 points, High at 3.5 points. Confidence is the size of the price edge only; the context below is what could move the result, not the number.",
        "price": "Wind forecast above 15 mph suppresses deep passing; historical totals in similar conditions skew under.",
        "support": [
          "7 books price this exact line, so the fair number is well established.",
          "Scorers out: Key Forward (F), knee. Fewer healthy scorers leans under."
        ],
        "risks": [
          "No sharp anchor on this line: fair is the de-vigged average of the books, which is softer."
        ],
        "notes": [
          "Weather at kickoff: Clear, 48°F, wind 6 mph, 5% rain.",
          "Records: Dallas 4-3 · Philadelphia 5-2 · Highmark Stadium, Orchard Park."
        ],
        "verdict": "The context lines up with the price."
      },
      "movement": null
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
      "ev": 0.078,
      "away": "NY Rangers",
      "home": "Boston",
      "marketKey": "totals",
      "context": {
        "espnEventId": "x7",
        "venue": "Arena",
        "indoor": true,
        "records": {
          "Boston": {
            "overall": "5-2",
            "home": "3-0",
            "away": null
          },
          "NY Rangers": {
            "overall": "4-3",
            "home": null,
            "away": "1-2"
          }
        },
        "probables": {},
        "injuries": {
          "Boston": [
            {
              "name": "Starting Guard",
              "pos": "G",
              "status": "Questionable",
              "type": "Ankle",
              "detail": "Sprain",
              "returnDate": null,
              "note": "Listed questionable; will test it pregame."
            }
          ],
          "NY Rangers": []
        },
        "rest": {
          "Boston": {
            "restDays": 3,
            "b2b": false,
            "lastGame": "2026-11-03",
            "gamesLast7": 3
          },
          "NY Rangers": {
            "restDays": 2,
            "b2b": false,
            "lastGame": "2026-11-02",
            "gamesLast7": 3
          }
        },
        "weather": null,
        "broadcast": "ESPN"
      },
      "breakdown": {
        "tier": "Medium",
        "tierWhy": "Edge of 4.3 points over the fair line. Lean starts at 1.0 points, Medium at 2.0 points, High at 3.5 points. Confidence is the size of the price edge only; the context below is what could move the result, not the number.",
        "price": "Both starting goalies rank top-ten in goals saved above expected over the last 30 days.",
        "support": [
          "Fair line comes from Pinnacle's de-vigged price, the sharpest public market.",
          "8 books price this exact line, so the fair number is well established.",
          "The sharp line has moved toward this side since it was logged (fair 58.8% → 60.0%).",
          "A better price is now available: -115 at BetMGM."
        ],
        "risks": [],
        "notes": [
          "Indoor venue; weather is not a factor.",
          "Records: NY Rangers 4-3 · Boston 5-2 · Arena."
        ],
        "verdict": "The context lines up with the price."
      },
      "movement": {
        "loggedOdds": -120,
        "loggedFair": 0.588,
        "currentOdds": -115,
        "currentBook": "BetMGM",
        "currentFair": 0.6,
        "currentEdge": 0.054545454545454564,
        "checkedAt": "2026-11-04T16:00:00Z",
        "history": [
          {
            "at": "2026-11-04T12:00:00Z",
            "odds": -120,
            "fair": 0.588
          }
        ]
      }
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
      "ev": 0.1148,
      "away": "NY Yankees",
      "home": "Houston",
      "marketKey": "spreads",
      "context": {
        "espnEventId": "x8",
        "venue": "Emirates Stadium, London",
        "indoor": false,
        "records": {
          "Houston": {
            "overall": "5-2",
            "home": "3-0",
            "away": null
          },
          "NY Yankees": {
            "overall": "4-3",
            "home": null,
            "away": "1-2"
          }
        },
        "probables": {
          "Houston": "Spencer Strider (ERA 2.91)",
          "NY Yankees": "Yoshinobu Yamamoto (ERA 2.40)"
        },
        "injuries": {
          "Houston": [],
          "NY Yankees": []
        },
        "rest": {
          "Houston": {
            "restDays": 1,
            "b2b": true,
            "lastGame": "2026-11-03",
            "gamesLast7": 3
          },
          "NY Yankees": {
            "restDays": 2,
            "b2b": false,
            "lastGame": "2026-11-02",
            "gamesLast7": 3
          }
        },
        "weather": {
          "summary": "Clear",
          "tempF": 48,
          "windMph": 6,
          "precipPct": 5,
          "source": "Open-Meteo",
          "city": "Buffalo, NY, USA"
        },
        "broadcast": "ESPN"
      },
      "breakdown": {
        "tier": "Lean",
        "tierWhy": "Edge of 4.7 points over the fair line. Lean starts at 1.0 points, Medium at 2.0 points, High at 3.5 points. Confidence is the size of the price edge only; the context below is what could move the result, not the number.",
        "price": "Plus-money run line with a favorable bullpen matchup; model edge is thin, so sized as a lean.",
        "support": [
          "Fair line comes from Pinnacle's de-vigged price, the sharpest public market.",
          "Houston are on a back-to-back."
        ],
        "risks": [],
        "notes": [
          "Weather at kickoff: Clear, 48°F, wind 6 mph, 5% rain.",
          "Probable pitchers: Houston Spencer Strider (ERA 2.91) · Yankees Yoshinobu Yamamoto (ERA 2.40).",
          "Records: NY Yankees 4-3 · Houston 5-2 · Emirates Stadium, London."
        ],
        "verdict": "The context lines up with the price."
      },
      "movement": null
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
      "ev": 0.0608,
      "home": "Real Madrid",
      "away": "Sevilla",
      "marketKey": "h2h",
      "context": {
        "espnEventId": "x9",
        "venue": "Highmark Stadium, Orchard Park",
        "indoor": false,
        "records": {
          "Real Madrid": {
            "overall": "5-2",
            "home": "3-0",
            "away": null
          },
          "Sevilla": {
            "overall": "4-3",
            "home": null,
            "away": "1-2"
          }
        },
        "probables": {},
        "injuries": {
          "Real Madrid": [
            {
              "name": "Starting Guard",
              "pos": "G",
              "status": "Questionable",
              "type": "Ankle",
              "detail": "Sprain",
              "returnDate": null,
              "note": "Listed questionable; will test it pregame."
            }
          ],
          "Sevilla": [
            {
              "name": "Key Forward",
              "pos": "F",
              "status": "Out",
              "type": "Knee",
              "detail": "Sprain",
              "returnDate": "2026-11-20",
              "note": "Out at least two weeks."
            }
          ]
        },
        "rest": {
          "Real Madrid": {
            "restDays": 3,
            "b2b": false,
            "lastGame": "2026-11-03",
            "gamesLast7": 3
          },
          "Sevilla": {
            "restDays": 2,
            "b2b": false,
            "lastGame": "2026-11-02",
            "gamesLast7": 3
          }
        },
        "weather": {
          "summary": "Rain",
          "tempF": 48,
          "windMph": 18,
          "precipPct": 70,
          "source": "Open-Meteo",
          "city": "Buffalo, NY, USA"
        },
        "broadcast": "ESPN"
      },
      "breakdown": {
        "tier": "High",
        "tierWhy": "Edge of 4.0 points over the fair line. Lean starts at 1.0 points, Medium at 2.0 points, High at 3.5 points. Confidence is the size of the price edge only; the context below is what could move the result, not the number.",
        "price": "Simulation gives the home side a 69.5% win probability versus 65.5% implied by the price.",
        "support": [
          "6 books price this exact line, so the fair number is well established.",
          "The sharp line has moved toward this side since it was logged (fair 69.5% → 70.7%).",
          "A better price is now available: -185 at BetRivers.",
          "Sevilla missing Key Forward (F), knee.",
          "Real Madrid are rested: 3 days since their last game."
        ],
        "risks": [
          "No sharp anchor on this line: fair is the de-vigged average of the books, which is softer.",
          "Real Madrid listed Starting Guard (G), ankle as questionable.",
          "Weather at kickoff: Rain, 48°F, wind 18 mph, 70% rain. Rough conditions add variance."
        ],
        "notes": [
          "Records: Sevilla 4-3 · Real Madrid 5-2 · Highmark Stadium, Orchard Park."
        ],
        "verdict": "The context lines up with the price."
      },
      "movement": {
        "loggedOdds": -190,
        "loggedFair": 0.695,
        "currentOdds": -185,
        "currentBook": "BetRivers",
        "currentFair": 0.707,
        "currentEdge": 0.051827586206896537,
        "checkedAt": "2026-11-04T16:00:00Z",
        "history": [
          {
            "at": "2026-11-04T12:00:00Z",
            "odds": -190,
            "fair": 0.695
          }
        ]
      }
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
      "ev": 0.0557,
      "away": "Golden State",
      "home": "Sacramento",
      "marketKey": "h2h",
      "context": {
        "espnEventId": "x10",
        "venue": "Arena",
        "indoor": true,
        "records": {
          "Sacramento": {
            "overall": "5-2",
            "home": "3-0",
            "away": null
          },
          "Golden State": {
            "overall": "4-3",
            "home": null,
            "away": "1-2"
          }
        },
        "probables": {},
        "injuries": {
          "Sacramento": [],
          "Golden State": []
        },
        "rest": {
          "Sacramento": {
            "restDays": 3,
            "b2b": false,
            "lastGame": "2026-11-03",
            "gamesLast7": 3
          },
          "Golden State": {
            "restDays": 2,
            "b2b": false,
            "lastGame": "2026-11-02",
            "gamesLast7": 3
          }
        },
        "weather": null,
        "broadcast": "ESPN"
      },
      "breakdown": {
        "tier": "Lean",
        "tierWhy": "Edge of 2.7 points over the fair line. Lean starts at 1.0 points, Medium at 2.0 points, High at 3.5 points. Confidence is the size of the price edge only; the context below is what could move the result, not the number.",
        "price": "Home underdog with a positive net rating in the last ten; the model marks the fair price near even.",
        "support": [
          "Fair line comes from Pinnacle's de-vigged price, the sharpest public market.",
          "7 books price this exact line, so the fair number is well established.",
          "Sacramento are rested: 3 days since their last game."
        ],
        "risks": [],
        "notes": [
          "Indoor venue; weather is not a factor.",
          "Records: Golden State 4-3 · Sacramento 5-2 · Arena."
        ],
        "verdict": "The context lines up with the price."
      },
      "movement": null
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
      "ev": 0.0699,
      "away": "San Francisco",
      "home": "Seattle",
      "marketKey": "spreads",
      "context": {
        "espnEventId": "x11",
        "venue": "Emirates Stadium, London",
        "indoor": false,
        "records": {
          "Seattle": {
            "overall": "5-2",
            "home": "3-0",
            "away": null
          },
          "San Francisco": {
            "overall": "4-3",
            "home": null,
            "away": "1-2"
          }
        },
        "probables": {},
        "injuries": {
          "Seattle": [
            {
              "name": "Starting Guard",
              "pos": "G",
              "status": "Questionable",
              "type": "Ankle",
              "detail": "Sprain",
              "returnDate": null,
              "note": "Listed questionable; will test it pregame."
            }
          ],
          "San Francisco": []
        },
        "rest": {
          "Seattle": {
            "restDays": 3,
            "b2b": false,
            "lastGame": "2026-11-03",
            "gamesLast7": 3
          },
          "San Francisco": {
            "restDays": 2,
            "b2b": false,
            "lastGame": "2026-11-02",
            "gamesLast7": 3
          }
        },
        "weather": {
          "summary": "Rain",
          "tempF": 48,
          "windMph": 18,
          "precipPct": 70,
          "source": "Open-Meteo",
          "city": "Buffalo, NY, USA"
        },
        "broadcast": "ESPN"
      },
      "breakdown": {
        "tier": "Lean",
        "tierWhy": "Edge of 3.6 points over the fair line. Lean starts at 1.0 points, Medium at 2.0 points, High at 3.5 points. Confidence is the size of the price edge only; the context below is what could move the result, not the number.",
        "price": "Key number at 3 with a reduced price; the model's fair line is -4, giving modest value at -105.",
        "support": [
          "Fair line comes from Pinnacle's de-vigged price, the sharpest public market.",
          "8 books price this exact line, so the fair number is well established.",
          "The sharp line has moved toward this side since it was logged (fair 54.8% → 56.0%).",
          "A better price is now available: -100 at FanDuel."
        ],
        "risks": [
          "Weather at kickoff: Rain, 48°F, wind 18 mph, 70% rain. Rough conditions add variance."
        ],
        "notes": [
          "Seattle have Starting Guard (G), ankle questionable.",
          "Records: San Francisco 4-3 · Seattle 5-2 · Emirates Stadium, London."
        ],
        "verdict": "The context lines up with the price."
      },
      "movement": {
        "loggedOdds": -105,
        "loggedFair": 0.548,
        "currentOdds": -100,
        "currentBook": "FanDuel",
        "currentFair": 0.56,
        "currentEdge": 0.04780487804878053,
        "checkedAt": "2026-11-04T16:00:00Z",
        "history": [
          {
            "at": "2026-11-04T12:00:00Z",
            "odds": -105,
            "fair": 0.548
          }
        ]
      }
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
    "result": null,
    "home": "Buffalo",
    "away": "Kansas City",
    "marketKey": "spreads",
    "context": {
      "espnEventId": "x0",
      "venue": "Highmark Stadium, Orchard Park",
      "indoor": false,
      "records": {
        "Buffalo": {
          "overall": "5-2",
          "home": "3-0",
          "away": null
        },
        "Kansas City": {
          "overall": "4-3",
          "home": null,
          "away": "1-2"
        }
      },
      "probables": {},
      "injuries": {
        "Buffalo": [],
        "Kansas City": [
          {
            "name": "Key Forward",
            "pos": "F",
            "status": "Out",
            "type": "Knee",
            "detail": "Sprain",
            "returnDate": "2026-11-20",
            "note": "Out at least two weeks."
          }
        ]
      },
      "rest": {
        "Buffalo": {
          "restDays": 1,
          "b2b": true,
          "lastGame": "2026-11-03",
          "gamesLast7": 3
        },
        "Kansas City": {
          "restDays": 2,
          "b2b": false,
          "lastGame": "2026-11-02",
          "gamesLast7": 3
        }
      },
      "weather": {
        "summary": "Clear",
        "tempF": 48,
        "windMph": 6,
        "precipPct": 5,
        "source": "Open-Meteo",
        "city": "Buffalo, NY, USA"
      },
      "broadcast": "ESPN"
    },
    "breakdown": {
      "tier": "High",
      "tierWhy": "Edge of 6.1 points over the fair line. Lean starts at 1.0 points, Medium at 2.0 points, High at 3.5 points. Confidence is the size of the price edge only; the context below is what could move the result, not the number.",
      "price": "Model favors the home team's rest advantage and pass-rush matchup; line has moved toward Buffalo since open.",
      "support": [
        "Kansas City missing Key Forward (F), knee."
      ],
      "risks": [
        "No sharp anchor on this line: fair is the de-vigged average of the books, which is softer.",
        "Buffalo are on the second night of a back-to-back."
      ],
      "notes": [
        "Weather at kickoff: Clear, 48°F, wind 6 mph, 5% rain.",
        "Records: Kansas City 4-3 · Buffalo 5-2 · Highmark Stadium, Orchard Park."
      ],
      "verdict": "More working against this one than for it beyond the price; size down."
    },
    "movement": null
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
