---
name: add-idea
description: Add one or more activity ideas (restaurants, sights, events, day trips) to the Poland trip planner. Use when someone says "add …", "we should do …", or pastes a link or place they want to visit.
---

1. Work out the city from the request, or ask if it's unclear. Cities are in `data/trip.json`.
2. For each idea, add an object to `data/activities/<city>.json` following `data/AGENTS.md`. Include:
   a unique `id` with the city prefix, `type`, a 1–2 sentence `description`, `address` with `lat`/`lng`, `duration`, `maxDuration`,
   `suggestedStart`, `price` (PLN per person, `approx: true`), `wiki` (English Wikipedia title) if there is one,
   `status: "idea"` and `addedBy` (the person's name if known).
3. If they gave a specific day or time, also set `status: "yes"`, `date` and `start`, and check for clashes on that day.
4. Run `node scripts/validate.mjs` and fix any errors.
5. Reply in plain words: what you added, typical length, best time and rough price. Mention anything uncertain (hours, prices, seasonal dates).
6. Commit and push to `main` if asked (or if they want it on their phone). The site updates in about a minute.
