---
name: plan-day
description: Suggest or build a balanced plan for a specific trip day (or several days) in the Poland trip planner, accounting for travel time, opening hours and rest.
---

1. Read `data/trip.json` to find the day's city and lodging (from `stays`), plus any transport on that day in `data/transport.json`.
2. Read that city's `data/activities/<city>.json`. Candidates have status `idea` or `maybe`; respect `no`. Things already `yes` on that day are fixed.
3. Build a plan that:
   - stays at or under `settings.maxActivityMinutes` of activities and leaves ≥ `minRestMinutes` free,
   - starts after `earliest` and ends before `latest`, within each place's `hours`,
   - groups nearby places (use lat/lng) and leaves realistic travel gaps (walk ≤ 1.5 km, otherwise tram or Uber),
   - puts viewpoints near sunset (about 3:30–4 PM) and Christmas markets in the evening,
   - keeps Nov 21–22 light for jet lag.
4. Show the proposal first as a short timeline (time, activity, travel between stops, rough cost). Only write it into the JSON
   (`status: "yes"`, `date`, `start`) once they agree, then run `node scripts/validate.mjs`.
