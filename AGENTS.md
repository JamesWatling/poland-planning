# AGENTS.md: Poland trip planner

Instructions for AI agents (Claude Code, Codex, etc.) working in this repo. Humans: see README.md.

## What this is

A small static website for planning a train trip through **Warsaw, Gdańsk, Kraków, Zakopane and Prague** (LOT flights LAX ⇄ WAW,
**Nov 20 – Dec 9, 2026**) for James, his wife, and their small dog. Only use those five cities unless they ask.
It's served by GitHub Pages: https://jameswatling.github.io/poland-planning/

There's no build step and no framework: `index.html` + `styles.css` + `app.js` (UI) + `planner.js` (pure logic, shared with the scripts).
**Everything about the trip lives in JSON files under `data/`. Those files *are* the database.** They're versioned by git,
served free by GitHub Pages, and easy to diff. Most requests are just edits to them; you rarely need to touch the code.

## Who you're probably talking to

James, or his wife (vegan, may not be technical). They travel with a small dog and want **trains, not planes** between cities. Be friendly, skip the jargon, and confirm what you changed in plain words.
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
| – | `data/inbox/`, `data/sync.json` | Changes saved from phones (see below) and the log of which were applied/rejected | the deploy workflow |
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
- **The dog.** Every activity has `dog`: yes / carrier / no / unknown. Prefer dog-friendly ideas, and make sure each city has plenty of dog-friendly walks, parks and cafés. "No dogs" isn't an exclusion (one person can walk the dog), but the site flags it. Lodging must be dog-friendly. Trains only between cities; never suggest flights.
- **Respect preferences.** Never add ideas matching `avoid`. Rank `interests` higher. Every `food` item needs a `vegan` rating, and each city needs several genuinely vegan-friendly places.
- **The DB is append-only in spirit.** Never delete an idea someone rejected; it stays `"status": "no"` so it's never suggested again. Don't add duplicates or close variants of existing ideas (check `node scripts/brief.mjs <city>`).
- **Be honest about uncertainty.** Verify with web search when you can. Mark prices `approx`, and hours `hoursApprox`. Never invent bookings or flight numbers; leave things generated or `placeholder` until the user gives real details.
- Season: late Nov – early Dec, around 0 °C, sunset about 3:30–4 PM, Christmas markets on. Favour indoor and evening-friendly options, and put viewpoints near sunset.
- Time zones: Poland `Europe/Warsaw` (CET, UTC+1), LA `America/Los_Angeles` (PST, UTC−8). JSON times are **local wall-clock**.

## How changes from the website get saved

1. On a phone, swipes and edits are applied instantly and kept in that browser (localStorage).
2. **Save to shared plan** (the bar above the tabs) commits them as one JSON file to `data/inbox/` via the GitHub API, using a
   fine-grained token for this repo only (Contents: read & write), set once per phone under ⋯ → GitHub connection.
3. `.github/workflows/pages.yml` runs on that push: `scripts/apply-changes.mjs` merges each inbox file (oldest first) into the
   data files, **validates each batch on its own** (rolling back and moving it to `data/inbox/failed/` if it would break the data),
   records the result in `data/sync.json`, commits, and redeploys. Runs are serialized, so two people saving at once is fine.
4. The phone keeps showing its saved changes as "pending" until `data/sync.json` lists them as applied (about 1–2 min), then reloads.
   If a batch was rejected, its changes come back as unsaved on that phone, with the error.

Without a token, ⋯ → Share link / Download changes still work, and an agent can apply a pasted export with `apply-changes`.

## Code notes (if you change the UI)

- Keep it dependency-free and mobile-first; test at phone width (`require('playwright')` works in cloud sessions).
- `planner.js` must stay DOM-free; the scripts import it.
- Website changes live in each browser's localStorage until exported (⋯ → Download/Copy/Share). The repo JSON is the shared truth.
