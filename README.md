# Poland & Prague trip planner 🇵🇱🇨🇿🐶

**Nov 20 – Dec 9, 2026** · Warsaw · Gdańsk · Kraków · Zakopane · Prague · by train, with our small dog

👉 **Open it on your phone: https://jameswatling.github.io/poland-planning/**
(Tip: Share → "Add to Home Screen" makes it feel like an app.)

## How to use it

1. **Lock down the route first** (Trip → ✏️ Edit route). Pick the city you fly into and the one you fly home from, add cities
   and nights, choose a neighbourhood to stay in, and **pin days** ("in Kraków all day Nov 28"). **✨ Regenerate** fits
   the nights, keeps pins, and can reorder cities to save train time. Stays and trains are created from the route.
2. **Set preferences** (💚 Our preferences): interests (ranked higher, ⭐), things to avoid (hidden), diets (🌱 vegan ratings on
   food), flexible wishes, and what you want in a place to stay.
3. **Swipe** through each day's ideas: **right = yes** (it slots into the next free time that fits), **left = no**,
   **up / 🕐 = yes, but at another time or day**, **? = maybe**.
4. **Day** shows the plan from your stay and back, with travel between stops (walk / tram / Uber with rough fares),
   activity, travel and free time, cost, and warnings when it's packed, overlapping or at silly hours.
5. **Ideas** lists everything by city and status. Add your own with **＋ Add idea**.
6. **Cities & travel times** shows every supported city with recommended nights, where to stay, and train times.

### Saving your picks

Changes show up instantly on your phone. To share them, tap **Save to shared plan** (the bar above the tabs).
The first time, the phone asks for a GitHub token (steps are on screen: a fine-grained token for this repo with
*Contents: read & write*). The site then updates for both of you in about 1–2 minutes. If a save would break something,
it's rejected and your changes stay on your phone with the reason.

No token? **⋯ → Share my picks as a link** (merges on the other phone) or **Download / Copy changes** for Claude.

## Claude does the research

Open this repo in Claude Code on your computer and ask, for example:

| You say | What happens |
|---|---|
| "Research activities for Kraków and Gdańsk" | `research-city` runs a `city-researcher` subagent per city: web research → new ideas in `data/activities/` that match your interests and diet, skipping anything you rejected |
| "Give Prague an extra night" / "We must be in Kraków on Nov 28" | `plan-route` updates and regenerates the route |
| "Check real train times" / "Find Airbnbs in Kazimierz" | `research-logistics` |
| "Add the ice rink at Rynek" | `add-idea` |
| "Plan a relaxed Saturday in Gdańsk" | `plan-day` |
| "Here are my picks: {…}" | `apply-changes` |

The JSON files in `data/` are the database: git tracks every change, GitHub Pages hosts them for free, and rejected ideas
stay marked `no` so research never suggests them again. Instructions for agents are in [AGENTS.md](AGENTS.md) and
[data/AGENTS.md](data/AGENTS.md).

## Running locally

```bash
python3 -m http.server 8000          # then open http://localhost:8000
node scripts/validate.mjs            # check the data
node scripts/route.mjs               # print the route (add --regenerate to refit it)
node scripts/brief.mjs [city]        # what's in the activity database
```

Every push to `main` is validated and deployed by `.github/workflows/pages.yml`.

## Still to fill in

✈️ **Flights are booked:** LOT LO 22 LAX → WAW (Fri Nov 20, 4:10 PM → Sat Nov 21, 12:45 PM) and LO 23 WAW → LAX (Wed Dec 9, 4:40 PM → 8:10 PM).
Trains and dog-friendly Airbnbs are still **placeholders** generated from the route (marked "to book" / "not booked").
The nights per city are a first draft. Prices, opening hours, train times and dog rules are approximate, so run
`research-city` / `research-logistics` to verify them.
