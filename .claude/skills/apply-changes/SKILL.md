---
name: apply-changes
description: Save picks, new ideas, route edits and preference edits made on the planner website into the repo. Use when someone pastes a "poland-planner-changes" JSON, uploads a changes-*.json file, or says they made picks on their phone.
---

1. Save the JSON to `data/inbox/<name>-<date>.json` (it may already be there).
2. Run `node scripts/apply-changes.mjs`, then `node scripts/validate.mjs` and `node scripts/route.mjs`.
3. Summarise in plain words, e.g. "Jane said yes to Wawel on Thu Nov 26 at 10:00, no to the vodka museum, added 2 ideas,
   and changed the route to add a night in Toruń". Point out validation warnings (overlaps, packed days, activities left
   off the route).
4. Commit ("Apply Jane's picks") and push to `main`. Then tell them they can clear the changes on their device (⋯ → Clear this device's changes).
