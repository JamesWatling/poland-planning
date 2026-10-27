# AGENTS.md: Poland trip planner

Instructions for AI agents (Claude Code, Codex, etc.) working in this repo. Humans: see README.md.

## What this is

A small static website for planning a trip to Poland (**Thu Nov 19 – Thu Dec 10, 2026**) for James and his wife.
It's served by GitHub Pages: https://jameswatling.github.io/poland-planning/

There's no build step and no framework: `index.html` + `styles.css` + `app.js` (UI) + `planner.js` (pure logic, shared with the scripts).
**All trip content lives in JSON files under `data/`.** Most requests ("add this restaurant", "we booked the flight",
"move Wawel to Friday") are just edits to those files. You rarely need to touch the code.

## Who you're probably talking to

Often James's wife, who may not be technical. Be friendly, skip the jargon, confirm what you changed in plain words
(e.g. "Added *Ice skating at Rynek* to Kraków ideas, best around 6 PM, ~1h, ~25 PLN"), and push when asked, so it shows on the site.

## Files

| Path | What |
|---|---|
| `data/trip.json` | Dates, settings (sensible hours, max activity/day, exchange rates), **cities**, and **stays** (where we sleep each night) |
| `data/transport.json` | Flights, trains, buses, booked Ubers: anything with a from → to |
| `data/activities/<city>.json` | Ideas and planned activities for each city |
| `data/inbox/` | Change files exported from the website; apply them with `node scripts/apply-changes.mjs` |
| `scripts/validate.mjs` | Checks the data. **Run it after every edit.** CI runs it and won't deploy if it fails |
| `scripts/apply-changes.mjs` | Merges website exports into the data files |
| `data/AGENTS.md` | Field-by-field data reference with examples. Read it before editing data |

## Workflow

1. Read `data/AGENTS.md` for the schema.
2. Edit the JSON (keep 2-space indentation, one object per item, and stable `id`s).
3. Run `node scripts/validate.mjs` and fix any **ERROR**s. Warnings are fine. Placeholders and missing bookings are expected.
4. Preview if useful: `python3 -m http.server 8000`, then open http://localhost:8000.
5. Commit with a plain message (e.g. "Add ice skating idea in Kraków") and push to `main`. GitHub Pages deploys in about 1 min.

## Planning rules (please follow them when suggesting or scheduling things)

- **Don't overplan.** Keep each day at or under `settings.maxActivityMinutes` (8h) and leave ≥ 2h of free time. Jet-lag days (Nov 21–22) should be light.
- **Sensible hours.** Nothing starts before 08:00 or ends after 22:30 local time unless it's a flight or train we can't move.
- **No overlaps.** Leave travel time between stops. The site estimates it from coordinates, so every activity needs `lat`/`lng`.
- **Every activity gets** an address, lat/lng, a typical `duration` and a `maxDuration` (minutes), a `suggestedStart`, an approximate `price` (PLN per person, `"approx": true`), and a 1–2 sentence description.
- **Images:** set `wiki` to the English Wikipedia article title (e.g. `"Wawel_Castle"`); the site pulls its photo. Or set `image` to a direct image URL.
- **Be honest about uncertainty.** Prices, opening hours and Christmas market dates change. Mark them `approx` and tell the user to check. Never invent flight numbers or bookings; use `"placeholder": true` until the user gives real details.
- It's late November / early December: cold (around 0 °C), dark by about 3:30–4 PM, and Christmas markets are on. Favour indoor options and put viewpoints near sunset.
- Time zones: Poland is `Europe/Warsaw` (CET, UTC+1); LA is `America/Los_Angeles` (PST, UTC−8). Times in JSON are **local wall-clock** times.

## Statuses (how the "Tinder" decisions are stored)

`idea` (not decided) · `maybe` · `yes` (scheduled: needs `date` + `start`) · `no` (rejected; keep it so it isn't suggested again) ·
`planned` / `booked` (transport and other fixed things).

## Code notes (if you do change the UI)

- Keep it dependency-free and mobile-first. Test at phone width (Playwright is available: `require('playwright')`).
- `planner.js` must stay DOM-free; `scripts/validate.mjs` imports it.
- Decisions made on the website live in the browser's localStorage until exported. The JSON in the repo is the shared source of truth.
