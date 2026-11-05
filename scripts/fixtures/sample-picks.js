/* SAMPLE DATA (test fixture, not real picks). Shape matches what scripts/update-data.js writes. */
window.PICKS_DATA = {
  "sample": true,
  "generatedAt": "2026-11-04T09:00:00-05:00",
  "trackedAt": "2026-11-04T16:00:00-05:00",
  "picks": [
    {
      "id": "p1",
      "sport": "NFL",
      "league": "NFL",
      "event": "Kansas City @ Buffalo",
      "start": "Sun 4:25 PM ET",
      "commence": "2026-11-08T21:25:00Z",
      "market": "Spread",
      "pick": "Buffalo -2.5",
      "odds": -110,
      "modelProb": 0.612,
      "confidence": "High",
      "basis": "game",
      "model": {
        "margin": 6,
        "total": 47.5,
        "sd": 13.5,
        "sdTotal": 14,
        "gp": 7,
        "thin": false,
        "parts": {
          "ratingHome": 3.1,
          "ratingAway": -0.9,
          "homeEdge": 2,
          "rest": 0,
          "injuriesHome": 0,
          "injuriesAway": 0,
          "scoringOut": 0,
          "pace": 47.5
        },
        "reasons": {
          "for": [
            "Buffalo rate +3.1 a game over 7 (5-2), Kansas City -0.9 over 7 (4-3)",
            "Home edge +2 for Buffalo",
            "Projected margin +6 for Buffalo against -2.5",
            "Kansas City without Key Forward (F), knee"
          ],
          "against": [
            "Buffalo are on the second night of a back-to-back"
          ]
        }
      },
      "marketFair": 0.585,
      "marketEdge": 0.0612,
      "rationale": "Our probability at -2.5 is 61.2%, from the game data: this season's results and margins, recent form, rest, the injury report and home edge (projected margin +6 for the home side). DraftKings offers -110, which implies only 52.4%. Not graded against other books' prices; for reference the market makes it 58.5%.",
      "factors": [
        "Best price -110 at DraftKings",
        "Probability 61.2% from game data, not other books",
        "Edge 8.8 points over the price",
        "Market reference 58.5%"
      ],
      "book": "DraftKings",
      "valueTo": -139,
      "status": "pending",
      "result": null,
      "units": null,
      "score": null,
      "loggedAt": "2026-11-04T09:00:00-05:00",
      "prices": {
        "DraftKings": -110,
        "FanDuel": -120,
        "BetMGM": -125,
        "Caesars": -115,
        "BetRivers": -120,
        "PointsBet": -105,
        "Unibet": -112
      },
      "ev": 0.1684,
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
        "tierWhy": "Our probability for this side is 61.2%, from the game data: results and margins this season, recent form, rest, the injury report and home edge. The price at DraftKings implies 52.4%, so the edge is 8.8 points. Lean starts at 3.0 points, Medium at 5.0 points, High at 8.0 points. Nothing here is graded against other books' prices; the market lines below are shown only for reference.",
        "price": "Our probability at -2.5 is 61.2%, from the game data: this season's results and margins, recent form, rest, the injury report and home edge (projected margin +6 for the home side). DraftKings offers -110, which implies only 52.4%. Not graded against other books' prices; for reference the market makes it 58.5%.",
        "support": [
          "Buffalo rate +3.1 a game over 7 (5-2), Kansas City -0.9 over 7 (4-3).",
          "Home edge +2 for Buffalo.",
          "Projected margin +6 for Buffalo against -2.5.",
          "Kansas City without Key Forward (F), knee."
        ],
        "risks": [
          "Buffalo are on the second night of a back-to-back."
        ],
        "notes": [
          "Where the market sits: the de-vigged consensus of 7 books makes this side 58.5% (+6.1 points against the best price). For reference only.",
          "Weather at kickoff: Clear, 48°F, wind 6 mph, 5% rain.",
          "Records: Kansas City 4-3 · Buffalo 5-2 · Highmark Stadium, Orchard Park."
        ],
        "verdict": "The game data lines up behind this side at this price."
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
      "commence": "2026-11-05T01:00:00Z",
      "market": "Total",
      "pick": "Over 226.5",
      "odds": -108,
      "modelProb": 0.601,
      "confidence": "High",
      "basis": "game",
      "model": {
        "margin": -1.5,
        "total": 231,
        "sd": 12.5,
        "sdTotal": 19,
        "gp": 8,
        "thin": false,
        "parts": {
          "ratingHome": -0.9,
          "ratingAway": 3.1,
          "homeEdge": 2.5,
          "rest": 0,
          "injuriesHome": 0,
          "injuriesAway": 0,
          "scoringOut": 0,
          "pace": 231
        },
        "reasons": {
          "for": [
            "Combined scoring 231.8 a game in Milwaukee's games, 230.4 in Boston's",
            "Projected total 231 against 226.5"
          ],
          "against": []
        }
      },
      "marketFair": 0.567,
      "marketEdge": 0.0478,
      "rationale": "Our probability at 226.5 is 60.1%, from the game data: this season's results and margins, recent form, rest, the injury report and home edge (projected total 231). FanDuel offers -108, which implies only 51.9%. Not graded against other books' prices; for reference the market makes it 56.7%.",
      "factors": [
        "Best price -108 at FanDuel",
        "Probability 60.1% from game data, not other books",
        "Edge 8.2 points over the price",
        "Market reference 56.7%"
      ],
      "book": "FanDuel",
      "valueTo": -133,
      "status": "pending",
      "result": null,
      "units": null,
      "score": null,
      "loggedAt": "2026-11-04T09:00:00-05:00",
      "prices": {
        "DraftKings": -108,
        "FanDuel": -108,
        "BetMGM": -113,
        "Caesars": -118,
        "BetRivers": -123
      },
      "ev": 0.1575,
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
              "athleteId": "4000000000",
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
        "tierWhy": "Our probability for this side is 60.1%, from the game data: results and margins this season, recent form, rest, the injury report and home edge. The price at FanDuel implies 51.9%, so the edge is 8.2 points. Lean starts at 3.0 points, Medium at 5.0 points, High at 8.0 points. Nothing here is graded against other books' prices; the market lines below are shown only for reference.",
        "price": "Our probability at 226.5 is 60.1%, from the game data: this season's results and margins, recent form, rest, the injury report and home edge (projected total 231). FanDuel offers -108, which implies only 51.9%. Not graded against other books' prices; for reference the market makes it 56.7%.",
        "support": [
          "Combined scoring 231.8 a game in Milwaukee's games, 230.4 in Boston's.",
          "Projected total 231 against 226.5.",
          "A better price is now available: -103 at FanDuel."
        ],
        "risks": [],
        "notes": [
          "Where the market sits: Pinnacle's de-vigged price makes this side 56.7% (+4.8 points against the best price). For reference only.",
          "Market: the sharp line has moved toward this side since it was logged (56.7% → 57.9%).",
          "Indoor venue; weather is not a factor.",
          "Records: Boston 4-3 · Milwaukee 5-2 · Arena."
        ],
        "verdict": "The game data lines up behind this side at this price."
      },
      "movement": {
        "loggedOdds": -108,
        "loggedFair": 0.601,
        "currentOdds": -103,
        "currentBook": "FanDuel",
        "currentFair": 0.579,
        "currentEdge": 0.0936,
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
      "commence": "2026-11-05T02:00:00Z",
      "market": "Moneyline",
      "pick": "Colorado ML",
      "odds": -135,
      "modelProb": 0.63,
      "confidence": "Medium",
      "basis": "game",
      "model": {
        "margin": 0.6,
        "total": 6.1,
        "sd": 2.4,
        "sdTotal": 2.3,
        "gp": 13,
        "thin": false,
        "parts": {
          "ratingHome": 1.3,
          "ratingAway": 0.9,
          "homeEdge": 0.2,
          "rest": 0,
          "injuriesHome": 0,
          "injuriesAway": 0,
          "scoringOut": 0,
          "pace": 6.1
        },
        "reasons": {
          "for": [
            "Colorado rate +1.3 a game over 13 (5-2), Toronto +0.9 over 13 (4-3)",
            "Home edge +0.2 for Colorado",
            "Projected margin +0.6 for Colorado",
            "Colorado are rested: 3 days since their last game"
          ],
          "against": []
        }
      },
      "marketFair": 0.615,
      "marketEdge": 0.0405,
      "rationale": "Our probability is 63.0%, from the game data: this season's results and margins, recent form, rest, the injury report and home edge (projected margin +0.6 for the home side). BetMGM offers -135, which implies only 57.4%. Not graded against other books' prices; for reference the market makes it 61.5%.",
      "factors": [
        "Best price -135 at BetMGM",
        "Probability 63.0% from game data, not other books",
        "Edge 5.5 points over the price",
        "Market reference 61.5%"
      ],
      "book": "BetMGM",
      "valueTo": -150,
      "status": "pending",
      "result": null,
      "units": null,
      "score": null,
      "loggedAt": "2026-11-04T09:00:00-05:00",
      "prices": {
        "DraftKings": -135,
        "FanDuel": -140,
        "BetMGM": -135,
        "Caesars": -150,
        "BetRivers": -140
      },
      "ev": 0.0967,
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
        "tierWhy": "Our probability for this side is 63.0%, from the game data: results and margins this season, recent form, rest, the injury report and home edge. The price at BetMGM implies 57.4%, so the edge is 5.5 points. Lean starts at 3.0 points, Medium at 5.0 points, High at 8.0 points. Nothing here is graded against other books' prices; the market lines below are shown only for reference.",
        "price": "Our probability is 63.0%, from the game data: this season's results and margins, recent form, rest, the injury report and home edge (projected margin +0.6 for the home side). BetMGM offers -135, which implies only 57.4%. Not graded against other books' prices; for reference the market makes it 61.5%.",
        "support": [
          "Colorado rate +1.3 a game over 13 (5-2), Toronto +0.9 over 13 (4-3).",
          "Home edge +0.2 for Colorado.",
          "Projected margin +0.6 for Colorado.",
          "Colorado are rested: 3 days since their last game."
        ],
        "risks": [],
        "notes": [
          "Where the market sits: Pinnacle's de-vigged price makes this side 61.5% (+4.0 points against the best price). For reference only.",
          "Indoor venue; weather is not a factor.",
          "Records: Toronto 4-3 · Colorado 5-2 · Arena."
        ],
        "verdict": "The game data lines up behind this side at this price."
      },
      "movement": null
    },
    {
      "id": "p4",
      "sport": "MLB",
      "league": "MLB",
      "event": "LA Dodgers @ Atlanta",
      "start": "Tonight 7:20 PM ET",
      "commence": "2026-11-05T00:20:00Z",
      "market": "Moneyline",
      "pick": "Atlanta ML",
      "odds": 120,
      "modelProb": 0.516,
      "confidence": "Medium",
      "basis": "game",
      "model": {
        "margin": 0.4,
        "total": 8.6,
        "sd": 4.2,
        "sdTotal": 4.6,
        "gp": 30,
        "thin": false,
        "parts": {
          "ratingHome": 1.2,
          "ratingAway": 1,
          "homeEdge": 0.2,
          "rest": 0,
          "injuriesHome": 0,
          "injuriesAway": 0,
          "scoringOut": 0,
          "pace": 8.6
        },
        "reasons": {
          "for": [
            "Atlanta rate +1.2 a game over 30 (5-2), LA Dodgers +1 over 30 (4-3)",
            "Home edge +0.2 for Atlanta",
            "Projected margin +0.4 for Atlanta",
            "LA Dodgers without Key Forward (F), knee",
            "Atlanta are rested: 3 days since their last game"
          ],
          "against": [
            "Atlanta listed Starting Guard (G), ankle as questionable"
          ]
        }
      },
      "marketFair": 0.495,
      "marketEdge": 0.0405,
      "rationale": "Our probability is 51.6%, from the game data: this season's results and margins, recent form, rest, the injury report and home edge (projected margin +0.4 for the home side). Caesars offers +120, which implies only 45.5%. Not graded against other books' prices; for reference the market makes it 49.5%.",
      "factors": [
        "Best price +120 at Caesars",
        "Probability 51.6% from game data, not other books",
        "Edge 6.2 points over the price",
        "Market reference 49.5%"
      ],
      "book": "Caesars",
      "valueTo": 106,
      "status": "pending",
      "result": null,
      "units": null,
      "score": null,
      "loggedAt": "2026-11-04T09:00:00-05:00",
      "prices": {
        "DraftKings": 115,
        "FanDuel": 110,
        "BetMGM": 105,
        "Caesars": 120,
        "BetRivers": 110
      },
      "ev": 0.1352,
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
        "tierWhy": "Our probability for this side is 51.6%, from the game data: results and margins this season, recent form, rest, the injury report and home edge. The price at Caesars implies 45.5%, so the edge is 6.2 points. Lean starts at 3.0 points, Medium at 5.0 points, High at 8.0 points. Nothing here is graded against other books' prices; the market lines below are shown only for reference.",
        "price": "Our probability is 51.6%, from the game data: this season's results and margins, recent form, rest, the injury report and home edge (projected margin +0.4 for the home side). Caesars offers +120, which implies only 45.5%. Not graded against other books' prices; for reference the market makes it 49.5%.",
        "support": [
          "Atlanta rate +1.2 a game over 30 (5-2), LA Dodgers +1 over 30 (4-3).",
          "Home edge +0.2 for Atlanta.",
          "Projected margin +0.4 for Atlanta.",
          "LA Dodgers without Key Forward (F), knee.",
          "Atlanta are rested: 3 days since their last game.",
          "A better price is now available: +125 at Caesars."
        ],
        "risks": [
          "Atlanta listed Starting Guard (G), ankle as questionable.",
          "Weather at kickoff: Rain, 48°F, wind 18 mph, 70% rain. Rough conditions add variance."
        ],
        "notes": [
          "Where the market sits: the de-vigged consensus of 5 books makes this side 49.5% (+4.0 points against the best price). For reference only.",
          "Market: the sharp line has moved toward this side since it was logged (49.5% → 50.7%).",
          "Probable pitchers: Atlanta Spencer Strider (ERA 2.91) · Dodgers Yoshinobu Yamamoto (ERA 2.40).",
          "Records: LA Dodgers 4-3 · Atlanta 5-2 · Highmark Stadium, Orchard Park."
        ],
        "verdict": "The game data lines up behind this side at this price."
      },
      "movement": {
        "loggedOdds": 120,
        "loggedFair": 0.516,
        "currentOdds": 125,
        "currentBook": "Caesars",
        "currentFair": 0.507,
        "currentEdge": 0.0716,
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
      "commence": "2026-11-07T17:30:00Z",
      "market": "Total",
      "pick": "Over 2.5 goals",
      "odds": -115,
      "modelProb": 0.606,
      "confidence": "Medium",
      "basis": "game",
      "model": {
        "margin": 0.2,
        "total": 3.1,
        "sd": 1.7,
        "sdTotal": 1.8,
        "gp": 10,
        "thin": false,
        "parts": {
          "ratingHome": 1.1,
          "ratingAway": 1.2,
          "homeEdge": 0.3,
          "rest": 0,
          "injuriesHome": 0,
          "injuriesAway": 0,
          "scoringOut": 0,
          "pace": 3.1
        },
        "reasons": {
          "for": [
            "Combined scoring 3.9 a game in Arsenal's games, 2.5 in Liverpool's",
            "Projected total 3.1 against 2.5"
          ],
          "against": []
        }
      },
      "marketFair": 0.578,
      "marketEdge": 0.0431,
      "rationale": "Our probability at 2.5 is 60.6%, from the game data: this season's results and margins, recent form, rest, the injury report and home edge (projected total 3.1). BetRivers offers -115, which implies only 53.5%. Not graded against other books' prices; for reference the market makes it 57.8%.",
      "factors": [
        "Best price -115 at BetRivers",
        "Probability 60.6% from game data, not other books",
        "Edge 7.1 points over the price",
        "Market reference 57.8%"
      ],
      "book": "BetRivers",
      "valueTo": -135,
      "status": "pending",
      "result": null,
      "units": null,
      "score": null,
      "loggedAt": "2026-11-04T09:00:00-05:00",
      "prices": {
        "DraftKings": -125,
        "FanDuel": -130,
        "BetMGM": -120,
        "Caesars": -125,
        "BetRivers": -115
      },
      "ev": 0.133,
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
        "tierWhy": "Our probability for this side is 60.6%, from the game data: results and margins this season, recent form, rest, the injury report and home edge. The price at BetRivers implies 53.5%, so the edge is 7.1 points. Lean starts at 3.0 points, Medium at 5.0 points, High at 8.0 points. Nothing here is graded against other books' prices; the market lines below are shown only for reference.",
        "price": "Our probability at 2.5 is 60.6%, from the game data: this season's results and margins, recent form, rest, the injury report and home edge (projected total 3.1). BetRivers offers -115, which implies only 53.5%. Not graded against other books' prices; for reference the market makes it 57.8%.",
        "support": [
          "Combined scoring 3.9 a game in Arsenal's games, 2.5 in Liverpool's.",
          "Projected total 3.1 against 2.5."
        ],
        "risks": [
          "Arsenal on a back-to-back; tired legs lean under."
        ],
        "notes": [
          "Where the market sits: Pinnacle's de-vigged price makes this side 57.8% (+4.3 points against the best price). For reference only.",
          "Weather at kickoff: Clear, 48°F, wind 6 mph, 5% rain.",
          "Records: Liverpool 4-3 · Arsenal 5-2 · Truist Park, Atlanta."
        ],
        "verdict": "The game data lines up behind this side at this price."
      },
      "movement": null
    },
    {
      "id": "p6",
      "sport": "NBA",
      "league": "NBA",
      "event": "Denver @ Phoenix",
      "start": "Tonight 10:00 PM ET",
      "commence": "2026-11-05T03:00:00Z",
      "market": "Spread",
      "pick": "Denver +3.5",
      "odds": -110,
      "modelProb": 0.566,
      "confidence": "Lean",
      "basis": "game",
      "model": {
        "margin": -0.5,
        "total": 229,
        "sd": 12.5,
        "sdTotal": 19,
        "gp": 8,
        "thin": false,
        "parts": {
          "ratingHome": -0.4,
          "ratingAway": 2.6,
          "homeEdge": 2.5,
          "rest": 0,
          "injuriesHome": 0,
          "injuriesAway": 0,
          "scoringOut": 0,
          "pace": 229
        },
        "reasons": {
          "for": [
            "Phoenix rate -0.4 a game over 8 (5-2), Denver +2.6 over 8 (4-3)",
            "Projected margin +0.5 for Denver against +3.5"
          ],
          "against": [
            "Home edge +2.5 for Phoenix"
          ]
        }
      },
      "marketFair": 0.552,
      "marketEdge": 0.0282,
      "rationale": "Our probability at +3.5 is 56.6%, from the game data: this season's results and margins, recent form, rest, the injury report and home edge (projected margin -0.5 for the home side). DraftKings offers -110, which implies only 52.4%. Not graded against other books' prices; for reference the market makes it 55.2%.",
      "factors": [
        "Best price -110 at DraftKings",
        "Probability 56.6% from game data, not other books",
        "Edge 4.2 points over the price",
        "Market reference 55.2%"
      ],
      "book": "DraftKings",
      "valueTo": -115,
      "status": "pending",
      "result": null,
      "units": null,
      "score": null,
      "loggedAt": "2026-11-04T09:00:00-05:00",
      "prices": {
        "DraftKings": -110,
        "FanDuel": -115,
        "BetMGM": -120,
        "Caesars": -125,
        "BetRivers": -115
      },
      "ev": 0.0805,
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
        "tierWhy": "Our probability for this side is 56.6%, from the game data: results and margins this season, recent form, rest, the injury report and home edge. The price at DraftKings implies 52.4%, so the edge is 4.2 points. Lean starts at 3.0 points, Medium at 5.0 points, High at 8.0 points. Nothing here is graded against other books' prices; the market lines below are shown only for reference.",
        "price": "Our probability at +3.5 is 56.6%, from the game data: this season's results and margins, recent form, rest, the injury report and home edge (projected margin -0.5 for the home side). DraftKings offers -110, which implies only 52.4%. Not graded against other books' prices; for reference the market makes it 55.2%.",
        "support": [
          "Phoenix rate -0.4 a game over 8 (5-2), Denver +2.6 over 8 (4-3).",
          "Projected margin +0.5 for Denver against +3.5.",
          "A better price is now available: -105 at DraftKings."
        ],
        "risks": [
          "Home edge +2.5 for Phoenix."
        ],
        "notes": [
          "Where the market sits: Pinnacle's de-vigged price makes this side 55.2% (+2.8 points against the best price). For reference only.",
          "Market: the sharp line has moved toward this side since it was logged (55.2% → 56.4%).",
          "Phoenix have Starting Guard (G), ankle questionable.",
          "Indoor venue; weather is not a factor.",
          "Records: Denver 4-3 · Phoenix 5-2 · Arena."
        ],
        "verdict": "The game data lines up behind this side at this price."
      },
      "movement": {
        "loggedOdds": -110,
        "loggedFair": 0.566,
        "currentOdds": -105,
        "currentBook": "DraftKings",
        "currentFair": 0.5640000000000001,
        "currentEdge": 0.0538,
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
      "commence": "2026-11-08T18:00:00Z",
      "market": "Total",
      "pick": "Under 48.5",
      "odds": -112,
      "modelProb": 0.596,
      "confidence": "Medium",
      "basis": "game",
      "model": {
        "margin": 2.5,
        "total": 44.5,
        "sd": 13.5,
        "sdTotal": 14,
        "gp": 8,
        "thin": false,
        "parts": {
          "ratingHome": 1.4,
          "ratingAway": 0.9,
          "homeEdge": 2,
          "rest": 0,
          "injuriesHome": 0,
          "injuriesAway": 0,
          "scoringOut": 0,
          "pace": 44.5
        },
        "reasons": {
          "for": [
            "Combined scoring 45.3 a game in Philadelphia's games, 43.9 in Dallas's",
            "Projected total 44.5 against 48.5"
          ],
          "against": []
        }
      },
      "marketFair": 0.561,
      "marketEdge": 0.0327,
      "rationale": "Our probability at 48.5 is 59.6%, from the game data: this season's results and margins, recent form, rest, the injury report and home edge (projected total 44.5). FanDuel offers -112, which implies only 52.8%. Not graded against other books' prices; for reference the market makes it 56.1%.",
      "factors": [
        "Best price -112 at FanDuel",
        "Probability 59.6% from game data, not other books",
        "Edge 6.8 points over the price",
        "Market reference 56.1%"
      ],
      "book": "FanDuel",
      "valueTo": -130,
      "status": "pending",
      "result": null,
      "units": null,
      "score": null,
      "loggedAt": "2026-11-04T09:00:00-05:00",
      "prices": {
        "DraftKings": -117,
        "FanDuel": -112,
        "BetMGM": -127,
        "Caesars": -117,
        "BetRivers": -122
      },
      "ev": 0.1281,
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
        "tierWhy": "Our probability for this side is 59.6%, from the game data: results and margins this season, recent form, rest, the injury report and home edge. The price at FanDuel implies 52.8%, so the edge is 6.8 points. Lean starts at 3.0 points, Medium at 5.0 points, High at 8.0 points. Nothing here is graded against other books' prices; the market lines below are shown only for reference.",
        "price": "Our probability at 48.5 is 59.6%, from the game data: this season's results and margins, recent form, rest, the injury report and home edge (projected total 44.5). FanDuel offers -112, which implies only 52.8%. Not graded against other books' prices; for reference the market makes it 56.1%.",
        "support": [
          "Combined scoring 45.3 a game in Philadelphia's games, 43.9 in Dallas's.",
          "Projected total 44.5 against 48.5.",
          "Scorers out: Key Forward (F), knee. Fewer healthy scorers leans under."
        ],
        "risks": [],
        "notes": [
          "Where the market sits: the de-vigged consensus of 5 books makes this side 56.1% (+3.3 points against the best price). For reference only.",
          "Weather at kickoff: Clear, 48°F, wind 6 mph, 5% rain.",
          "Records: Dallas 4-3 · Philadelphia 5-2 · Highmark Stadium, Orchard Park."
        ],
        "verdict": "The game data lines up behind this side at this price."
      },
      "movement": null
    },
    {
      "id": "p8",
      "sport": "NHL",
      "league": "NHL",
      "event": "NY Rangers @ Boston",
      "start": "Tonight 7:00 PM ET",
      "commence": "2026-11-05T00:00:00Z",
      "market": "Total",
      "pick": "Under 5.5",
      "odds": -120,
      "modelProb": 0.615,
      "confidence": "Medium",
      "basis": "game",
      "model": {
        "margin": 0.3,
        "total": 5.2,
        "sd": 2.4,
        "sdTotal": 2.3,
        "gp": 13,
        "thin": false,
        "parts": {
          "ratingHome": 1.2,
          "ratingAway": 1.1,
          "homeEdge": 0.2,
          "rest": 0,
          "injuriesHome": 0,
          "injuriesAway": 0,
          "scoringOut": 0,
          "pace": 5.2
        },
        "reasons": {
          "for": [
            "Combined scoring 6 a game in Boston's games, 4.6 in NY Rangers's",
            "Projected total 5.2 against 5.5"
          ],
          "against": []
        }
      },
      "marketFair": 0.588,
      "marketEdge": 0.0425,
      "rationale": "Our probability at 5.5 is 61.5%, from the game data: this season's results and margins, recent form, rest, the injury report and home edge (projected total 5.2). BetMGM offers -120, which implies only 54.5%. Not graded against other books' prices; for reference the market makes it 58.8%.",
      "factors": [
        "Best price -120 at BetMGM",
        "Probability 61.5% from game data, not other books",
        "Edge 7.0 points over the price",
        "Market reference 58.8%"
      ],
      "book": "BetMGM",
      "valueTo": -140,
      "status": "pending",
      "result": null,
      "units": null,
      "score": null,
      "loggedAt": "2026-11-04T09:00:00-05:00",
      "prices": {
        "DraftKings": -130,
        "FanDuel": -135,
        "BetMGM": -120,
        "Caesars": -130,
        "BetRivers": -135
      },
      "ev": 0.1275,
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
        "tierWhy": "Our probability for this side is 61.5%, from the game data: results and margins this season, recent form, rest, the injury report and home edge. The price at BetMGM implies 54.5%, so the edge is 7.0 points. Lean starts at 3.0 points, Medium at 5.0 points, High at 8.0 points. Nothing here is graded against other books' prices; the market lines below are shown only for reference.",
        "price": "Our probability at 5.5 is 61.5%, from the game data: this season's results and margins, recent form, rest, the injury report and home edge (projected total 5.2). BetMGM offers -120, which implies only 54.5%. Not graded against other books' prices; for reference the market makes it 58.8%.",
        "support": [
          "Combined scoring 6 a game in Boston's games, 4.6 in NY Rangers's.",
          "Projected total 5.2 against 5.5.",
          "A better price is now available: -115 at BetMGM."
        ],
        "risks": [],
        "notes": [
          "Where the market sits: Pinnacle's de-vigged price makes this side 58.8% (+4.3 points against the best price). For reference only.",
          "Market: the sharp line has moved toward this side since it was logged (58.8% → 60.0%).",
          "Indoor venue; weather is not a factor.",
          "Records: NY Rangers 4-3 · Boston 5-2 · Arena."
        ],
        "verdict": "The game data lines up behind this side at this price."
      },
      "movement": {
        "loggedOdds": -120,
        "loggedFair": 0.615,
        "currentOdds": -115,
        "currentBook": "BetMGM",
        "currentFair": 0.6,
        "currentEdge": 0.0801,
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
      "commence": "2026-11-05T01:10:00Z",
      "market": "Run line",
      "pick": "Yankees -1.5",
      "odds": 145,
      "modelProb": 0.449,
      "confidence": "Lean",
      "basis": "game",
      "model": {
        "margin": -1.9,
        "total": 9.1,
        "sd": 4.2,
        "sdTotal": 4.6,
        "gp": 30,
        "thin": false,
        "parts": {
          "ratingHome": 0.1,
          "ratingAway": 2.2,
          "homeEdge": 0.2,
          "rest": 0,
          "injuriesHome": 0,
          "injuriesAway": 0,
          "scoringOut": 0,
          "pace": 9.1
        },
        "reasons": {
          "for": [
            "Houston rate +0.1 a game over 30 (5-2), NY Yankees +2.2 over 30 (4-3)",
            "Projected margin +1.9 for NY Yankees against -1.5",
            "Houston are on a back-to-back"
          ],
          "against": [
            "Home edge +0.2 for Houston"
          ]
        }
      },
      "marketFair": 0.455,
      "marketEdge": 0.0468,
      "rationale": "Our probability at -1.5 is 44.9%, from the game data: this season's results and margins, recent form, rest, the injury report and home edge (projected margin -1.9 for the home side). Caesars offers +145, which implies only 40.8%. Not graded against other books' prices; for reference the market makes it 45.5%.",
      "factors": [
        "Best price +145 at Caesars",
        "Probability 44.9% from game data, not other books",
        "Edge 4.1 points over the price",
        "Market reference 45.5%"
      ],
      "book": "Caesars",
      "valueTo": 139,
      "status": "pending",
      "result": null,
      "units": null,
      "score": null,
      "loggedAt": "2026-11-04T09:00:00-05:00",
      "prices": {
        "DraftKings": 130,
        "FanDuel": 140,
        "BetMGM": 135,
        "Caesars": 145,
        "BetRivers": 140
      },
      "ev": 0.1001,
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
        "tierWhy": "Our probability for this side is 44.9%, from the game data: results and margins this season, recent form, rest, the injury report and home edge. The price at Caesars implies 40.8%, so the edge is 4.1 points. Lean starts at 3.0 points, Medium at 5.0 points, High at 8.0 points. Nothing here is graded against other books' prices; the market lines below are shown only for reference.",
        "price": "Our probability at -1.5 is 44.9%, from the game data: this season's results and margins, recent form, rest, the injury report and home edge (projected margin -1.9 for the home side). Caesars offers +145, which implies only 40.8%. Not graded against other books' prices; for reference the market makes it 45.5%.",
        "support": [
          "Houston rate +0.1 a game over 30 (5-2), NY Yankees +2.2 over 30 (4-3).",
          "Projected margin +1.9 for NY Yankees against -1.5.",
          "Houston are on a back-to-back."
        ],
        "risks": [
          "Home edge +0.2 for Houston."
        ],
        "notes": [
          "Where the market sits: Pinnacle's de-vigged price makes this side 45.5% (+4.7 points against the best price). For reference only.",
          "Weather at kickoff: Clear, 48°F, wind 6 mph, 5% rain.",
          "Probable pitchers: Houston Spencer Strider (ERA 2.91) · Yankees Yoshinobu Yamamoto (ERA 2.40).",
          "Records: NY Yankees 4-3 · Houston 5-2 · Emirates Stadium, London."
        ],
        "verdict": "The game data lines up behind this side at this price."
      },
      "movement": null
    },
    {
      "id": "p10",
      "sport": "Soccer",
      "league": "La Liga",
      "event": "Real Madrid vs. Sevilla",
      "start": "Sun 3:00 PM ET",
      "commence": "2026-11-08T20:00:00Z",
      "market": "Moneyline",
      "pick": "Real Madrid ML",
      "odds": -190,
      "modelProb": 0.745,
      "confidence": "High",
      "basis": "game",
      "model": {
        "margin": 1.3,
        "total": 2.9,
        "sd": 1.7,
        "sdTotal": 1.8,
        "gp": 10,
        "thin": false,
        "parts": {
          "ratingHome": 1.6,
          "ratingAway": 0.6,
          "homeEdge": 0.3,
          "rest": 0,
          "injuriesHome": 0,
          "injuriesAway": 0,
          "scoringOut": 0,
          "pace": 2.9
        },
        "reasons": {
          "for": [
            "Real Madrid rate +1.6 a game over 10 (5-2), Sevilla +0.6 over 10 (4-3)",
            "Home edge +0.3 for Real Madrid",
            "Projected margin +1.3 for Real Madrid",
            "Sevilla without Key Forward (F), knee",
            "Real Madrid are rested: 3 days since their last game"
          ],
          "against": [
            "Real Madrid listed Starting Guard (G), ankle as questionable"
          ]
        }
      },
      "marketFair": 0.695,
      "marketEdge": 0.0398,
      "rationale": "Our probability is 74.5%, from the game data: this season's results and margins, recent form, rest, the injury report and home edge (projected margin +1.3 for the home side). BetRivers offers -190, which implies only 65.5%. Not graded against other books' prices; for reference the market makes it 69.5%.",
      "factors": [
        "Best price -190 at BetRivers",
        "Probability 74.5% from game data, not other books",
        "Edge 9.0 points over the price",
        "Market reference 69.5%"
      ],
      "book": "BetRivers",
      "valueTo": -250,
      "status": "pending",
      "result": null,
      "units": null,
      "score": null,
      "loggedAt": "2026-11-04T09:00:00-05:00",
      "prices": {
        "DraftKings": -195,
        "FanDuel": -200,
        "BetMGM": -205,
        "Caesars": -195,
        "BetRivers": -190
      },
      "ev": 0.1371,
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
        "tierWhy": "Our probability for this side is 74.5%, from the game data: results and margins this season, recent form, rest, the injury report and home edge. The price at BetRivers implies 65.5%, so the edge is 9.0 points. Lean starts at 3.0 points, Medium at 5.0 points, High at 8.0 points. Nothing here is graded against other books' prices; the market lines below are shown only for reference.",
        "price": "Our probability is 74.5%, from the game data: this season's results and margins, recent form, rest, the injury report and home edge (projected margin +1.3 for the home side). BetRivers offers -190, which implies only 65.5%. Not graded against other books' prices; for reference the market makes it 69.5%.",
        "support": [
          "Real Madrid rate +1.6 a game over 10 (5-2), Sevilla +0.6 over 10 (4-3).",
          "Home edge +0.3 for Real Madrid.",
          "Projected margin +1.3 for Real Madrid.",
          "Sevilla without Key Forward (F), knee.",
          "Real Madrid are rested: 3 days since their last game.",
          "A better price is now available: -185 at BetRivers."
        ],
        "risks": [
          "Real Madrid listed Starting Guard (G), ankle as questionable.",
          "Weather at kickoff: Rain, 48°F, wind 18 mph, 70% rain. Rough conditions add variance."
        ],
        "notes": [
          "Where the market sits: the de-vigged consensus of 5 books makes this side 69.5% (+4.0 points against the best price). For reference only.",
          "Market: the sharp line has moved toward this side since it was logged (69.5% → 70.7%).",
          "Records: Sevilla 4-3 · Real Madrid 5-2 · Highmark Stadium, Orchard Park."
        ],
        "verdict": "The game data lines up behind this side at this price."
      },
      "movement": {
        "loggedOdds": -190,
        "loggedFair": 0.745,
        "currentOdds": -185,
        "currentBook": "BetRivers",
        "currentFair": 0.707,
        "currentEdge": 0.0959,
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
      "commence": "2026-11-05T03:00:00Z",
      "market": "Moneyline",
      "pick": "Sacramento ML",
      "odds": 105,
      "modelProb": 0.527,
      "confidence": "Lean",
      "basis": "game",
      "model": {
        "margin": 1.4,
        "total": 233.5,
        "sd": 12.5,
        "sdTotal": 19,
        "gp": 3,
        "thin": true,
        "parts": {
          "ratingHome": 0.6,
          "ratingAway": 1.7,
          "homeEdge": 2.5,
          "rest": 0,
          "injuriesHome": 0,
          "injuriesAway": 0,
          "scoringOut": 0,
          "pace": 233.5
        },
        "reasons": {
          "for": [
            "Sacramento rate +0.6 a game over 3 (5-2), Golden State +1.7 over 3 (4-3)",
            "Home edge +2.5 for Sacramento",
            "Projected margin +1.4 for Sacramento",
            "Sacramento are rested: 3 days since their last game"
          ],
          "against": [
            "Thin sample: only 3 games behind one of these teams"
          ]
        }
      },
      "marketFair": 0.515,
      "marketEdge": 0.0272,
      "rationale": "Our probability is 52.7%, from the game data: this season's results and margins, recent form, rest, the injury report and home edge (projected margin +1.4 for the home side). DraftKings offers +105, which implies only 48.8%. Not graded against other books' prices; for reference the market makes it 51.5%.",
      "factors": [
        "Best price +105 at DraftKings",
        "Probability 52.7% from game data, not other books",
        "Edge 3.9 points over the price",
        "Market reference 51.5%"
      ],
      "book": "DraftKings",
      "valueTo": 102,
      "status": "pending",
      "result": null,
      "units": null,
      "score": null,
      "loggedAt": "2026-11-04T09:00:00-05:00",
      "prices": {
        "DraftKings": 105,
        "FanDuel": 90,
        "BetMGM": 100,
        "Caesars": 95,
        "BetRivers": 90
      },
      "ev": 0.0803,
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
        "tierWhy": "Our probability for this side is 52.7%, from the game data: results and margins this season, recent form, rest, the injury report and home edge. The price at DraftKings implies 48.8%, so the edge is 3.9 points. Lean starts at 3.0 points, Medium at 5.0 points, High at 8.0 points. Nothing here is graded against other books' prices; the market lines below are shown only for reference.",
        "price": "Our probability is 52.7%, from the game data: this season's results and margins, recent form, rest, the injury report and home edge (projected margin +1.4 for the home side). DraftKings offers +105, which implies only 48.8%. Not graded against other books' prices; for reference the market makes it 51.5%.",
        "support": [
          "Sacramento rate +0.6 a game over 3 (5-2), Golden State +1.7 over 3 (4-3).",
          "Home edge +2.5 for Sacramento.",
          "Projected margin +1.4 for Sacramento.",
          "Sacramento are rested: 3 days since their last game."
        ],
        "risks": [
          "Thin sample: only 3 games behind one of these teams."
        ],
        "notes": [
          "Where the market sits: Pinnacle's de-vigged price makes this side 51.5% (+2.7 points against the best price). For reference only.",
          "Indoor venue; weather is not a factor.",
          "Records: Golden State 4-3 · Sacramento 5-2 · Arena."
        ],
        "verdict": "The game data lines up behind this side at this price."
      },
      "movement": null
    },
    {
      "id": "p12",
      "sport": "NFL",
      "league": "NFL",
      "event": "San Francisco @ Seattle",
      "start": "Sun 4:05 PM ET",
      "commence": "2026-11-08T21:05:00Z",
      "market": "Spread",
      "pick": "San Francisco -3",
      "odds": -105,
      "modelProb": 0.556,
      "confidence": "Lean",
      "basis": "game",
      "model": {
        "margin": -5.5,
        "total": 43,
        "sd": 13.5,
        "sdTotal": 14,
        "gp": 8,
        "thin": false,
        "parts": {
          "ratingHome": -2.6,
          "ratingAway": 4.9,
          "homeEdge": 2,
          "rest": 0,
          "injuriesHome": 0,
          "injuriesAway": 0,
          "scoringOut": 0,
          "pace": 43
        },
        "reasons": {
          "for": [
            "Seattle rate -2.6 a game over 8 (5-2), San Francisco +4.9 over 8 (4-3)",
            "Projected margin +5.5 for San Francisco against -3"
          ],
          "against": [
            "Home edge +2 for Seattle"
          ]
        }
      },
      "marketFair": 0.548,
      "marketEdge": 0.0358,
      "rationale": "Our probability at -3 is 55.6%, from the game data: this season's results and margins, recent form, rest, the injury report and home edge (projected margin -5.5 for the home side). FanDuel offers -105, which implies only 51.2%. Not graded against other books' prices; for reference the market makes it 54.8%.",
      "factors": [
        "Best price -105 at FanDuel",
        "Probability 55.6% from game data, not other books",
        "Edge 4.4 points over the price",
        "Market reference 54.8%"
      ],
      "book": "FanDuel",
      "valueTo": -110,
      "status": "pending",
      "result": null,
      "units": null,
      "score": null,
      "loggedAt": "2026-11-04T09:00:00-05:00",
      "prices": {
        "DraftKings": -120,
        "FanDuel": -105,
        "BetMGM": -115,
        "Caesars": -120,
        "BetRivers": -110
      },
      "ev": 0.0855,
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
        "tierWhy": "Our probability for this side is 55.6%, from the game data: results and margins this season, recent form, rest, the injury report and home edge. The price at FanDuel implies 51.2%, so the edge is 4.4 points. Lean starts at 3.0 points, Medium at 5.0 points, High at 8.0 points. Nothing here is graded against other books' prices; the market lines below are shown only for reference.",
        "price": "Our probability at -3 is 55.6%, from the game data: this season's results and margins, recent form, rest, the injury report and home edge (projected margin -5.5 for the home side). FanDuel offers -105, which implies only 51.2%. Not graded against other books' prices; for reference the market makes it 54.8%.",
        "support": [
          "Seattle rate -2.6 a game over 8 (5-2), San Francisco +4.9 over 8 (4-3).",
          "Projected margin +5.5 for San Francisco against -3.",
          "A better price is now available: -100 at FanDuel."
        ],
        "risks": [
          "Home edge +2 for Seattle.",
          "Weather at kickoff: Rain, 48°F, wind 18 mph, 70% rain. Rough conditions add variance."
        ],
        "notes": [
          "Where the market sits: Pinnacle's de-vigged price makes this side 54.8% (+3.6 points against the best price). For reference only.",
          "Market: the sharp line has moved toward this side since it was logged (54.8% → 56.0%).",
          "Seattle have Starting Guard (G), ankle questionable.",
          "Records: San Francisco 4-3 · Seattle 5-2 · Emirates Stadium, London."
        ],
        "verdict": "The game data lines up behind this side at this price."
      },
      "movement": {
        "loggedOdds": -105,
        "loggedFair": 0.556,
        "currentOdds": -100,
        "currentBook": "FanDuel",
        "currentFair": 0.56,
        "currentEdge": 0.056,
        "checkedAt": "2026-11-04T16:00:00Z",
        "history": [
          {
            "at": "2026-11-04T12:00:00Z",
            "odds": -105,
            "fair": 0.548
          }
        ]
      }
    },
    {
      "id": "p13",
      "sport": "Soccer",
      "league": "Premier League",
      "event": "Chelsea vs. Newcastle",
      "start": "Today 3:00 PM ET",
      "commence": "2026-11-04T20:00:00Z",
      "market": "Total",
      "pick": "Over 2.5 goals",
      "odds": -105,
      "modelProb": 0.583,
      "confidence": "Medium",
      "basis": "game",
      "model": {
        "margin": 0.4,
        "total": 3.1,
        "sd": 1.7,
        "sdTotal": 1.6,
        "gp": 10,
        "thin": false,
        "parts": {
          "ratingHome": 0.6,
          "ratingAway": 0.1,
          "homeEdge": 0.24,
          "rest": 0,
          "injuriesHome": 0,
          "injuriesAway": 0,
          "scoringOut": 0,
          "pace": 3.1
        },
        "reasons": {
          "for": [
            "Projected total 3.1 against 2.5",
            "Chelsea score 2.1 a game at home over 5"
          ],
          "against": [
            "Newcastle concede 1.0 a game away"
          ]
        }
      },
      "marketFair": 0.548,
      "marketEdge": 0.0358,
      "rationale": "Our probability for Over 2.5 goals is 58.3%, from the game data: this season's results and margins, recent form, rest, the injury report and home edge. FanDuel offers -105, which implies 51.2%: an edge of 7.1 points, Medium. Not graded against other books' prices. For reference the market makes it 54.8%.",
      "factors": [
        "Projected total 3.1 against 2.5",
        "Best price -105 at FanDuel",
        "Edge +7.1 points over the price"
      ],
      "book": "FanDuel",
      "valueTo": -123,
      "status": "pending",
      "result": null,
      "units": null,
      "score": null,
      "loggedAt": "2026-11-04T09:00:00-05:00",
      "prices": {
        "FanDuel": -105,
        "DraftKings": -110,
        "BetMGM": -115,
        "Caesars": -112,
        "BetRivers": -110
      },
      "ev": 0.1382,
      "home": "Chelsea",
      "away": "Newcastle",
      "marketKey": "totals",
      "context": {
        "espnEventId": "x12"
      },
      "breakdown": {
        "tier": "Medium",
        "tierWhy": "Our probability 58.3% against the 51.2% the price implies: an edge of 7.1 points, over the 5-point Medium bar and under the 8-point High bar. Nothing is graded against other books’ prices.",
        "price": "Best price -105 at FanDuel.",
        "support": [
          "Projected total 3.1 against 2.5"
        ],
        "risks": [
          "Newcastle concede 1.0 a game away"
        ],
        "notes": [
          "Market: where the market sits, 54.8%"
        ],
        "verdict": "Medium: the projection clears the number by six tenths of a goal."
      },
      "movement": {
        "loggedOdds": -105,
        "loggedFair": 0.583,
        "currentOdds": -120,
        "currentBook": "DraftKings",
        "currentFair": 0.567,
        "currentEdge": 0.0375,
        "checkedAt": "2026-11-04T19:00:00Z",
        "history": [
          {
            "at": "2026-11-04T14:00:00Z",
            "odds": -105,
            "fair": 0.548
          }
        ]
      }
    },
    {
      "id": "p14",
      "sport": "Soccer",
      "league": "La Liga",
      "event": "Villarreal vs. Getafe",
      "start": "Today 1:00 PM ET",
      "commence": "2026-11-04T18:00:00Z",
      "market": "Moneyline",
      "pick": "Villarreal ML",
      "odds": -115,
      "modelProb": 0.6,
      "confidence": "Medium",
      "basis": "game",
      "model": {
        "margin": 0.9,
        "total": 2.4,
        "sd": 1.7,
        "sdTotal": 1.6,
        "gp": 11,
        "thin": false,
        "parts": {
          "ratingHome": 0.7,
          "ratingAway": -0.3,
          "homeEdge": 0.24,
          "rest": 0,
          "injuriesHome": 0,
          "injuriesAway": 0,
          "scoringOut": 0,
          "pace": 2.4
        },
        "reasons": {
          "for": [
            "Villarreal rate +0.7 a game over 11, Getafe -0.3 over 11",
            "Home edge +0.24 for Villarreal"
          ],
          "against": [
            "Getafe have drawn 4 of their last 6"
          ]
        }
      },
      "marketFair": 0.571,
      "marketEdge": 0.036,
      "rationale": "Our probability for Villarreal to win is 60.0%, from the game data. BetRivers offers -115, which implies 53.5%: an edge of 6.5 points, Medium. Not graded against other books' prices.",
      "factors": [
        "Villarreal +0.7 a game over 11",
        "Best price -115 at BetRivers",
        "Edge +6.5 points over the price"
      ],
      "book": "BetRivers",
      "valueTo": -132,
      "status": "graded",
      "result": "Win",
      "units": 0.87,
      "score": {
        "home": 2,
        "away": 0
      },
      "loggedAt": "2026-11-04T09:00:00-05:00",
      "prices": {
        "BetRivers": -115,
        "DraftKings": -120,
        "FanDuel": -125,
        "BetMGM": -120
      },
      "ev": 0.1217,
      "home": "Villarreal",
      "away": "Getafe",
      "marketKey": "h2h",
      "context": {
        "espnEventId": "x13"
      },
      "breakdown": {
        "tier": "Medium",
        "tierWhy": "Our probability 60.0% against the 53.5% the price implies: an edge of 6.5 points. Nothing is graded against other books’ prices.",
        "price": "Best price -115 at BetRivers.",
        "support": [
          "Villarreal +0.7 a game over 11"
        ],
        "risks": [
          "Getafe have drawn 4 of their last 6"
        ],
        "notes": [],
        "verdict": "Medium: the home side rates a goal better."
      },
      "movement": null
    }
  ],
  "playOfDay": {
    "id": "p1",
    "sport": "NFL",
    "league": "NFL",
    "event": "Kansas City @ Buffalo",
    "start": "Sun 4:25 PM ET",
    "commence": "2026-11-08T21:25:00Z",
    "market": "Spread",
    "pick": "Buffalo -2.5",
    "odds": -110,
    "modelProb": 0.612,
    "confidence": "High",
    "basis": "game",
    "model": {
      "margin": 6,
      "total": 47.5,
      "sd": 13.5,
      "sdTotal": 14,
      "gp": 7,
      "thin": false,
      "parts": {
        "ratingHome": 3.1,
        "ratingAway": -0.9,
        "homeEdge": 2,
        "rest": 0,
        "injuriesHome": 0,
        "injuriesAway": 0,
        "scoringOut": 0,
        "pace": 47.5
      },
      "reasons": {
        "for": [
          "Buffalo rate +3.1 a game over 7 (5-2), Kansas City -0.9 over 7 (4-3)",
          "Home edge +2 for Buffalo",
          "Projected margin +6 for Buffalo against -2.5",
          "Kansas City without Key Forward (F), knee"
        ],
        "against": [
          "Buffalo are on the second night of a back-to-back"
        ]
      }
    },
    "marketFair": 0.585,
    "marketEdge": 0.0612,
    "rationale": "Our probability at -2.5 is 61.2%, from the game data: this season's results and margins, recent form, rest, the injury report and home edge (projected margin +6 for the home side). DraftKings offers -110, which implies only 52.4%. Not graded against other books' prices; for reference the market makes it 58.5%.",
    "factors": [
      "Best price -110 at DraftKings",
      "Probability 61.2% from game data, not other books",
      "Edge 8.8 points over the price",
      "Market reference 58.5%"
    ],
    "book": "DraftKings",
    "valueTo": -139,
    "status": "pending",
    "result": null,
    "units": null,
    "score": null,
    "loggedAt": "2026-11-04T09:00:00-05:00",
    "prices": {
      "DraftKings": -110,
      "FanDuel": -120,
      "BetMGM": -125,
      "Caesars": -115,
      "BetRivers": -120
    },
    "ev": 0.1684,
    "started": false,
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
      "tierWhy": "Our probability for this side is 61.2%, from the game data: results and margins this season, recent form, rest, the injury report and home edge. The price at DraftKings implies 52.4%, so the edge is 8.8 points. Lean starts at 3.0 points, Medium at 5.0 points, High at 8.0 points. Nothing here is graded against other books' prices; the market lines below are shown only for reference.",
      "price": "Our probability at -2.5 is 61.2%, from the game data: this season's results and margins, recent form, rest, the injury report and home edge (projected margin +6 for the home side). DraftKings offers -110, which implies only 52.4%. Not graded against other books' prices; for reference the market makes it 58.5%.",
      "support": [
        "Buffalo rate +3.1 a game over 7 (5-2), Kansas City -0.9 over 7 (4-3).",
        "Home edge +2 for Buffalo.",
        "Projected margin +6 for Buffalo against -2.5.",
        "Kansas City without Key Forward (F), knee."
      ],
      "risks": [
        "Buffalo are on the second night of a back-to-back."
      ],
      "notes": [
        "Where the market sits: the de-vigged consensus of 7 books makes this side 58.5% (+6.1 points against the best price). For reference only.",
        "Weather at kickoff: Clear, 48°F, wind 6 mph, 5% rain.",
        "Records: Kansas City 4-3 · Buffalo 5-2 · Highmark Stadium, Orchard Park."
      ],
      "verdict": "The game data lines up behind this side at this price."
    },
    "movement": null
  },
  "parlayOfDay": {
    "id": "parlay-sample",
    "date": "2026-11-04",
    "book": "Caesars",
    "odds": 908,
    "decimal": 10.077,
    "fairProb": 0.1418,
    "ev": 0.4289,
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
