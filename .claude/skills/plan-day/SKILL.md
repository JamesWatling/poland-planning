---
name: plan-day
description: Suggest or build a balanced plan for a specific trip day (or several days), accounting for travel time, opening hours, rest, preferences and diet.
---

1. Run `node scripts/route.mjs` to see which city and lodging each day has, and the trains. Read that city's `data/activities/<city>.json`
   and `data/preferences.json`.
2. Candidates are status `idea` or `maybe`; never `no`, and nothing matching `avoid`. Things already `yes` that day are fixed.
3. Build a plan that:
   - stays at or under `settings.maxActivityMinutes` of activities and leaves ≥ `minRestMinutes` free (fewer on travel days),
   - starts after `earliest` (preferably the "relaxed mornings" time in preferences) and ends before `latest`, within `hours`,
   - groups nearby places (lat/lng) with realistic gaps (walk ≤ 1.5 km, otherwise tram or Uber),
   - includes a vegan-friendly lunch or dinner,
   - puts viewpoints near sunset (about 3:30–4 PM) and Christmas markets in the evening, and keeps Nov 21–22 light for jet lag.
4. Show the proposal first as a short timeline. Write it (`status: "yes"`, `date`, `start`) only once they agree, then run `node scripts/validate.mjs`.
