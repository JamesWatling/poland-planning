# AGENTS.md: Poland trip planner

Instructions for AI agents (Claude Code, Codex, etc.) working in this repo. Humans: see README.md.

## What this is

A small static website for planning a trip to Poland (**Thu Nov 19 – Thu Dec 10, 2026**) for James and his wife.
It's served by GitHub Pages: https://jameswatling.github.io/poland-planning/

There's no build step and no framework: `index.html` + `styles.css` + `app.js` (UI) + `planner.js` (pure logic, shared with the scripts).
**Everything about the trip lives in JSON files under `data/`. Those files *are* the database.** They're versioned by git,
served free by GitHub Pages, and easy to diff. Most requests are just edits to them; you rarely need to touch the code.

## Who you're probably talking to

James, or his wife (vegan, may not be technical). Be friendly, skip the jargon, and confirm what you changed in plain words.
Commit and push to `main` when asked so it shows on the site (about 1 min).

## The data, in the order it should be decided

| # | File | What | Who edits |
|---|---|---|---|
| 1 | `data/cities.json` | **Catalog of cities we support**: time zone, airport, main station, recommended nights, **stay areas** (neighbourhoods to book in) | agents (research) |
| 2 | `data/routes.json` | **Travel times between cities** (train/bus minutes, typical price) | agents (research) |
| 3 | `data/route.json` | **The route**: fly-in city, fly-home city, ordered stops with nights + stay area, **pinned days**, flight placeholder times | website (Edit route) or agents |
| 4 | `data/preferences.json` | Interests (boost), **avoid** (hard exclude), travelers and diets (wife is vegan), flexible preferences, lodging wishes | website (Our preferences) or agents |
| 5 | `data/activities/<city>.json` | **The activity database**: every idea with its status: idea / maybe / yes / **no** | website (swipes, exported) and agents (research) |
| 6 | `data/transport.json` | Only **booked** flights and trains. A `role` replaces the generated placeholder | agents, when the user books |
| – | `data/trip.json` | Trip dates, home and airport, planning settings, exchange rates | rarely |

Stays (where we sleep each night) and the trains between cities are **generated** from `route.json` + `routes.json`.
Don't hand-write them. Change the route, or add a booked item to `transport.json` with the matching `role`
(`outbound`, `return`, `warsaw>krakow`, `arrival>krakow`, `gdansk>departure`).

Full field reference: **`data/AGENTS.md`**. Read it before editing data.

## Scripts (run from the repo root)

```bash
node scripts/validate.mjs           # ALWAYS run after editing data. CI blocks the deploy on errors
node scripts/route.mjs              # show the route: stays, generated trains, pins, warnings
node scripts/route.mjs --regenerate # refit nights / order / pins (same as the website's ✨ Regenerate) and save
node scripts/brief.mjs              # ideas per city (total / undecided / yes / maybe / no)
node scripts/brief.mjs krakow       # research brief for a city: dates, preferences, everything already in the DB
node scripts/apply-changes.mjs      # merge website exports from data/inbox/ into the data files
python3 -m http.server 8000         # preview at http://localhost:8000
```

## Jobs (skills in `.claude/skills/`, subagent in `.claude/agents/`)

- **plan-route**: lock down cities, nights, pins and stay areas first. Everything else depends on this.
- **research-city**: fill or extend a city's activities using web research and preferences, never repeating rejected ideas.
  For several cities, run the `city-researcher` subagent once per city, in parallel.
- **research-logistics**: refine `routes.json` with real timetables and prices, and suggest stay areas or listings.
- **add-idea**: add specific things someone mentions.
- **plan-day**: build a balanced day from the ideas.
- **apply-changes**: save picks someone made on their phone into the repo.

## Planning rules

- **Don't overplan.** Keep each day at or under `settings.maxActivityMinutes` (8h) with ≥ 2h free. Jet-lag days (Nov 21–22) should be light.
- **Sensible hours.** Nothing before 08:00 or after 22:30 local, except unmovable transport.
- **No overlaps**, and leave travel time. Every activity needs `lat`/`lng` so the site can estimate it.
- **Respect preferences.** Never add ideas matching `avoid`. Rank `interests` higher. Every `food` item needs a `vegan` rating, and each city needs several genuinely vegan-friendly places.
- **The DB is append-only in spirit.** Never delete an idea someone rejected; it stays `"status": "no"` so it's never suggested again. Don't add duplicates or close variants of existing ideas (check `node scripts/brief.mjs <city>`).
- **Be honest about uncertainty.** Verify with web search when you can. Mark prices `approx`, and hours `hoursApprox`. Never invent bookings or flight numbers; leave things generated or `placeholder` until the user gives real details.
- Season: late Nov – early Dec, around 0 °C, sunset about 3:30–4 PM, Christmas markets on. Favour indoor and evening-friendly options, and put viewpoints near sunset.
- Time zones: Poland `Europe/Warsaw` (CET, UTC+1), LA `America/Los_Angeles` (PST, UTC−8). JSON times are **local wall-clock**.

## Code notes (if you change the UI)

- Keep it dependency-free and mobile-first; test at phone width (`require('playwright')` works in cloud sessions).
- `planner.js` must stay DOM-free; the scripts import it.
- Website changes live in each browser's localStorage until exported (⋯ → Download/Copy/Share). The repo JSON is the shared truth.
