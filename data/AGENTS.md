# Data reference

All times are **local wall-clock** times in 24h `HH:MM`. Dates are `YYYY-MM-DD`. Durations are whole **minutes**.
After any change, run `node scripts/validate.mjs` from the repo root.

## `cities.json`: the city catalog

Keyed by city id (lowercase ASCII: `warsaw`, `gdansk`, `krakow`, `zakopane`, `prague`). Prague is in the Czech Republic:
`tz` `Europe/Prague`, `currency` `CZK` (needs an `fxToUSD` rate in `trip.json`). `kind` is `"city"` for places we can visit. The special entries
`los-angeles` (`home`), `transit` and `unplanned` are used internally; leave them alone.

```json
"zakopane": {
  "kind": "city", "name": "Zakopane", "short": "ZAK", "tz": "Europe/Warsaw", "currency": "PLN", "color": "#0d9488",
  "lat": 49.2992, "lng": 19.9496,
  "file": "data/activities/zakopane.json",               // its activity database (a JSON array, may be [])
  "nights": { "min": 2, "ideal": 3, "max": 4 },        // used by Regenerate
  "description": "One or two sentences on why go.",
  "airport": { "code": "BZG", "name": "…", "address": "…", "lat": 0, "lng": 0 },   // optional
  "station": { "name": "Zakopane railway station", "address": "…", "lat": 49.3, "lng": 19.958 },
  "stayAreas": [
    { "id": "centre", "name": "Centre (near Krupówki)", "lat": 49.296, "lng": 19.95, "description": "Why stay here, plus trade-offs." }
  ]
}
```

To add a city: add the entry, create its `file` with `[]`, add `routes.json` connections to its neighbours, then research activities.

## `routes.json`: travel times between cities

Symmetric (A→B also covers B→A). The fastest entry for a pair wins. Pairs that are missing are estimated from distance
(shown with `*` on the site), so add real ones.

```json
{ "from": "krakow", "to": "zakopane", "mode": "train", "minutes": 150, "price": { "amount": 35, "currency": "PLN" },
  "notes": "Trains about 2.5h. Small dogs ride in a carrier.", "approx": true }
```

`mode`: `train` | `bus`. **No flights**: we travel with a small dog and prefer trains (`preferences.json` → `transport.avoid`).
Put dog rules in `notes` when they differ (e.g. buses).

## `route.json`: the route

```json
{
  "arrival":   { "city": "warsaw", "flight": { "depart": "2026-11-20T16:00", "arrive": "2026-11-21T14:30" } },
  "departure": { "city": "warsaw", "flight": { "depart": "2026-12-10T10:30", "arrive": "2026-12-10T17:30" } },
  "optimizeOrder": true,              // Regenerate may reorder the middle stops to save train time
  "defaultTravelTime": "10:30",       // generated trains leave at this time
  "stops": [
    { "city": "warsaw", "nights": 4, "area": "srodmiescie" },
    { "city": "krakow", "nights": 6, "area": "kazimierz", "lockNights": true },   // lockNights: Regenerate won't change it
    { "city": "gdansk", "nights": 4, "area": "main-town",
      "lodging": { "name": "Airbnb on Mariacka", "address": "…", "lat": 54.3496, "lng": 18.6555, "url": "https://…" } },  // once booked
    { "city": "warsaw", "nights": 2, "area": "srodmiescie" }
  ],
  "pins": [ { "date": "2026-12-05", "city": "gdansk", "note": "Friend's party" } ]   // be in that city all day
}
```

- Flight times: `depart` is in the home time zone, `arrive` is local to the arrival city (and the reverse for the return).
  When real flights are booked, put them in `transport.json` with `role: "outbound"` / `"return"`. They then win over these placeholders.
- The nights across stops must add up to the nights between landing and flying home. `node scripts/route.mjs` shows the totals;
  `--regenerate` fixes them while keeping pins and locked nights.
- `area` is a `stayAreas` id. It positions the placeholder lodging (so travel times make sense) and guides accommodation search.

## `preferences.json`

```json
{
  "interests": ["museums", "history", "christmas markets"],   // keywords: matching ideas get ⭐ and rank higher
  "avoid": ["bicycle"],                                       // keywords: matching ideas are hidden and never researched
  "travelers": [ { "name": "James", "diet": [] }, { "name": "…", "diet": ["vegan"], "notes": "" } ],
  "flexible": ["Food stops should have good vegan options", "Relaxed mornings"],  // soft preferences, in plain words
  "pets": [ { "name": "…", "type": "dog", "size": "small" } ],               // turns on dog ratings and warnings
  "transport": { "prefer": ["train"], "avoid": ["flight"] },
  "lodging": { "wants": ["dog-friendly (small dog)", "kitchen"], "budgetPerNight": { "amount": 150, "currency": "USD" } }
}
```

Keyword matching is a case-insensitive substring match on title, description, type, tags and notes ("museums" also matches "museum").

## Activity / idea (`data/activities/<city>.json`)

```json
{
  "id": "krk-ice-skating",            // unique, lowercase, city prefix (waw-, gdn-, krk-, zak-, prg-)
  "title": "Ice skating at the Old Town rink",
  "type": "event",                    // sight | museum | food | tour | daytrip | nature | event | nightlife | shopping | rest | other
  "city": "krakow",
  "status": "idea",                   // idea | maybe | yes | no   (no = rejected: keep it, never re-suggest)
  "description": "One or two sentences on why it's worth doing.",
  "address": "Plac Szczepański, 31-011 Kraków",
  "lat": 50.0636, "lng": 19.9349,     // required for travel-time estimates (4 decimals is plenty)
  "duration": 60,                     // typical time spent
  "maxDuration": 90,                  // don't let it run longer than this
  "suggestedStart": "18:00",          // best time of day
  "suggestedDate": "2026-11-28",      // optional: best day (day trips, events with dates)
  "hours": { "open": "10:00", "close": "21:00" }, "hoursApprox": true,   // optional; used for warnings and auto-scheduling
  "price": { "amount": 25, "currency": "PLN", "per": "person", "approx": true },  // 0 = free, null = unknown
  "vegan": "great",                   // food only: great | options | limited | none | unknown
  "dog": "yes",                       // yes | carrier | no | unknown (we travel with a small dog)
  "wiki": "Kraków_Old_Town",          // optional: English Wikipedia title for the photo
  "image": "https://…/photo.jpg",     // optional: direct image instead of wiki
  "url": "https://…",                 // tickets / website
  "tags": ["christmas", "evening"],
  "notes": "Skate rental available",
  "sources": ["https://…"],           // where you verified it (research job)
  "addedBy": "claude"                 // or the person's name
}
```

To schedule (what swiping "yes" does): `"status": "yes", "date": "2026-11-28", "start": "18:00"`. To reject: `"status": "no"`, no date/start.

## `transport.json`: booked transport only

```json
{
  "id": "lot-2", "role": "outbound",  // outbound | return | "<from>><to>" (e.g. "krakow>zakopane") | "arrival><city>" | "<city>>departure"
  "type": "flight", "title": "LOT 2 LAX → WAW", "city": "transit", "status": "booked",
  "description": "Confirmation ABC123.",
  "from": { "name": "LAX", "address": "…", "lat": 33.9416, "lng": -118.4085, "tz": "America/Los_Angeles", "time": "2026-11-20T15:55" },
  "to":   { "name": "WAW", "address": "…", "lat": 52.1657, "lng": 20.9671, "tz": "Europe/Warsaw", "time": "2026-11-21T12:10" },
  "price": { "amount": 1200, "currency": "USD", "per": "person" }
}
```

Items without a `role` (a booked Uber or tour bus, say) are shown as-is on their day.

## Saved from the website (`data/inbox/`, `data/sync.json`)

Phones with a GitHub token commit their changes straight into `data/inbox/`; the deploy workflow applies them (see AGENTS.md).
You only need to do it by hand for a pasted or downloaded export:

### Exports

⋯ → "Download changes" gives `{ "type": "poland-planner-changes", "exportedBy", "overrides", "added", "route", "preferences" }`.
Save it into `data/inbox/`, then run `node scripts/apply-changes.mjs && node scripts/validate.mjs`. Picks and edits are merged
into the activity files, new ideas are appended, and an edited route or preferences replaces the file. Afterwards, tell the user
to clear their device's changes (⋯ → Clear) since everything is now in the shared plan.
