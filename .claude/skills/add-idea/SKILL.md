---
name: add-idea
description: Add one or more specific activity ideas (restaurants, sights, events, day trips) that someone mentions to the Poland trip planner. Use when someone says "add …", "we should do …", or pastes a link or place.
---

1. Work out the city (ids are in `data/cities.json`); ask if it's unclear. Run `node scripts/brief.mjs <city>` to check it isn't already there (or rejected).
2. Add an object to `data/activities/<city>.json` following `data/AGENTS.md`: unique `id` with the city prefix, `type`, a 1–2 sentence
   `description`, `address` + `lat`/`lng`, `duration`, `maxDuration`, `suggestedStart`, `price` (PLN pp, `approx`), `vegan` for food,
   `wiki` if there's an article, `status: "idea"`, `addedBy` (the person's name if known).
3. If it matches something in `preferences.json` → `avoid`, say so and ask before adding.
4. If they gave a specific day or time, set `status: "yes"`, `date` and `start`, and check that day for clashes.
5. Run `node scripts/validate.mjs`, reply in plain words (what, how long, best time, rough price, anything uncertain), and commit and push if asked.
