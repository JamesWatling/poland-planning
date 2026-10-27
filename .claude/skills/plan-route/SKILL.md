---
name: plan-route
description: Decide or change which cities the Poland trip visits, in what order, for how many nights, where to stay (stay areas), and pinned days. Use for "add a night in Zakopane", "fly into Kraków instead", "we must be in Gdańsk on Dec 5", "rebalance the nights", or "where should we stay".
---

The route is the first thing to lock down. Stays and trains are generated from it.

1. Run `node scripts/route.mjs` to see the current plan. Read `data/route.json`, `data/cities.json` and `data/routes.json`.
2. Apply what the user asked in `data/route.json`: arrival/departure city, add or remove `stops`, `nights`, `lockNights`, `area`, `pins`.
   If a city isn't in `cities.json` yet, add it (see `data/AGENTS.md`) along with `routes.json` connections.
3. Run `node scripts/route.mjs --regenerate` to fit nights to the trip, respecting pins and locked nights (and reordering if
   `optimizeOrder` is true). Show the user the result: cities, nights, train times and total travel. Explain any trade-offs.
4. Suggest a stay area per city (from `stayAreas`), based on `preferences.json` → `lodging.wants` (e.g. near the station when there's an early train).
5. Run `node scripts/validate.mjs`. It warns about scheduled activities that no longer fit the route, and cities without ideas;
   offer to run `research-city` for new cities.
6. Commit ("Route: Prague 4 nights") and push if asked.
