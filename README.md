# Poland trip planner 🇵🇱

**Thu Nov 19 – Thu Dec 10, 2026** · Warsaw → Kraków → Wrocław → Gdańsk → Warsaw

👉 **Open it on your phone: https://jameswatling.github.io/poland-planning/**
(Tip: Share → "Add to Home Screen" makes it feel like an app.)

## How to use it

- **Trip**: a calendar of the whole trip, coloured by city, plus where we sleep and a timeline of every day. Tap a day to open it.
- **Day**: the plan for one day, from Airbnb to Airbnb, with travel time between stops (walk / tram / Uber with rough fares),
  total activity, travel and free time, cost, and warnings when a day is too packed, overlapping or at silly hours.
- **Swipe**: Tinder for that day's ideas. **Right = yes** (it slots into the next free time that fits), **left = no**,
  **up / 🕐 = yes, but at a different time or day**, **? = maybe**.
- **Ideas**: every idea by city and status. Add your own with **＋ Add idea**.

### Your picks live on your phone until you share them

Picks are saved in your phone's browser. To combine them:

- **⋯ → Share my picks as a link**: send it to each other. Opening the link merges the picks; the newer change wins.
- **⋯ → Download changes**: give the file to Claude (or paste it with ⋯ → Copy changes) to save it to the shared plan for good.

## Editing with Claude

Open this repo in Claude Code (or claude.ai/code) and just ask, for example:

- "Add the Christmas market ice rink in Kraków as an idea for the evening"
- "We booked the flight: LOT 2, leaves LAX 3:55 PM Nov 20, lands WAW 12:10 PM Nov 21"
- "Our Kraków Airbnb is at Józefa 12"
- "Plan a relaxed Saturday in Gdańsk"
- "Here are my picks: { …pasted JSON… }"

Instructions for agents are in [AGENTS.md](AGENTS.md) and [data/AGENTS.md](data/AGENTS.md). Skills in `.claude/skills/` cover the common jobs.

## Running locally

```bash
python3 -m http.server 8000     # then open http://localhost:8000
node scripts/validate.mjs       # check the data
```

Every push to `main` is validated and deployed to GitHub Pages by `.github/workflows/pages.yml`.

## Still to fill in

Flights, trains and Airbnbs are **placeholders** (marked "placeholder" / "to book" on the site). The city order and number of nights
are a first draft. Change `stays` in `data/trip.json`. Prices and opening hours are approximate.
