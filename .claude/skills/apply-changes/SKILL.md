---
name: apply-changes
description: Save picks and new ideas made on the planner website into the repo. Use when someone pastes a "poland-planner-changes" JSON, uploads a changes-*.json file, or says they made picks on their phone.
---

1. Save the JSON to `data/inbox/<name>-<date>.json` (it may already be there).
2. Run `node scripts/apply-changes.mjs`, then `node scripts/validate.mjs`.
3. Summarise what changed in plain words (e.g. "Jane said yes to Wawel on Thu Nov 26 at 10:00, no to the vodka museum, and added 2 ideas").
   Point out any validation warnings about overlaps or packed days.
4. Commit ("Apply Jane's picks") and push to `main`. Then tell them they can clear the changes on their device (⋯ → Clear this device's changes).
