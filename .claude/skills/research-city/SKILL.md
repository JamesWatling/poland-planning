---
name: research-city
description: Research and add activity ideas for one or more cities of the Poland trip (fills the activity database using interests, avoid list and diet, never repeating rejected ideas). Use for "fill in Kraków", "find more things to do", "research activities", or after adding a city to the route.
---

1. Run `node scripts/brief.mjs` to see which cities are on the route and how many ideas each has. If the user didn't name cities,
   pick the route cities with the fewest undecided ideas per day.
2. For each city, launch the **city-researcher** subagent (`.claude/agents/city-researcher.md`) with the prompt
   "Research <city id> for the Poland trip". Launch several in parallel, one per city; they edit different files.
   (Without subagents, follow the steps in that file yourself, one city at a time.)
3. When they finish, run `node scripts/validate.mjs` and fix any errors.
4. Summarise per city: ideas added, the top picks for this couple, and open questions. Commit ("Research ideas for Kraków, Gdańsk")
   and push to `main` if the user wants it on their phone.
