# Data reference

All times are **local wall-clock** times in 24h `HH:MM`. Dates are `YYYY-MM-DD`. Durations are whole **minutes**.
After any change, run `node scripts/validate.mjs` from the repo root.

## Activity / idea (`data/activities/<city>.json`)

```json
{
  "id": "krk-ice-skating",            // unique, lowercase, prefixed with the city code (waw-, krk-, wro-, gdn-)
  "title": "Ice skating at the Old Town rink",
  "type": "event",                    // sight | museum | food | tour | daytrip | nature | event | nightlife | shopping | rest | other
  "city": "krakow",                   // a key from trip.json "cities"
  "status": "idea",                   // idea | maybe | yes | no
  "description": "One or two sentences on why it's worth doing.",
  "address": "Plac Szczepański, 31-011 Kraków",
  "lat": 50.0636, "lng": 19.9349,     // required for travel-time estimates
  "duration": 60,                     // typical time spent
  "maxDuration": 90,                  // don't let it run longer than this
  "suggestedStart": "18:00",          // best time of day
  "suggestedDate": "2026-11-28",      // optional: best day (e.g. day trips, events)
  "hours": { "open": "10:00", "close": "21:00" },   // optional, used for warnings and auto-scheduling
  "hoursApprox": true,                // set when the hours above are a guess
  "price": { "amount": 25, "currency": "PLN", "per": "person", "approx": true },  // amount 0 = free, null = unknown
  "wiki": "Kraków_Old_Town",          // optional: English Wikipedia title for the photo
  "image": "https://…/photo.jpg",     // optional: direct image instead of wiki
  "url": "https://…",                 // optional: tickets/website
  "tags": ["christmas", "evening"],
  "notes": "Skate rental available",
  "addedBy": "Jane"                   // who suggested it (claude for pre-filled ideas)
}
```

**To schedule it** (what swiping "yes" does), set `"status": "yes"`, `"date": "2026-11-28"` and `"start": "18:00"`.
To reject it, set `"status": "no"` (and remove `date`/`start`). Don't delete pre-filled ideas; mark them `no` instead.

Finding coordinates: use a well-known landmark's coordinates, or OpenStreetMap
(`https://nominatim.openstreetmap.org/search?format=json&q=<address>` if you have network access). 4 decimals is plenty.

## Transport (`data/transport.json`)

Use this format for anything crossing time zones (flights) or with fixed times:

```json
{
  "id": "flight-out",
  "type": "flight",                   // flight | train | bus | uber | taxi | car | ferry | transfer
  "title": "LOT 2 LAX → WAW",
  "city": "transit",                  // which city's day it mostly belongs to
  "status": "booked",                 // planned | booked
  "placeholder": false,               // true until real times are known
  "description": "Confirmation ABC123. Seats 32A/B.",
  "from": { "name": "LAX", "address": "1 World Way, Los Angeles, CA 90045", "lat": 33.9416, "lng": -118.4085, "tz": "America/Los_Angeles", "time": "2026-11-20T16:00" },
  "to":   { "name": "WAW", "address": "Żwirki i Wigury 1, 00-906 Warszawa", "lat": 52.1657, "lng": 20.9671, "tz": "Europe/Warsaw", "time": "2026-11-21T14:30" },
  "price": { "amount": 1200, "currency": "USD", "per": "person" }
}
```

For a simple local ride with no time-zone change, you can instead use `date`, `start`, `duration` and `city` like an activity
(with `"status": "planned"`), and optionally `from`/`to` with just `name`/`lat`/`lng`.

## Stays (`data/trip.json` → `stays`)

Every night from `startDate` to the night before `endDate` must be covered by **exactly one** stay
(`checkIn` ≤ night < `checkOut`). The stay decides each day's city and its start and end point.

```json
{ "id": "krakow", "city": "krakow", "checkIn": "2026-11-25", "checkOut": "2026-12-01",
  "lodging": { "name": "Airbnb on Józefa St", "address": "Józefa 12, 31-056 Kraków", "lat": 50.0510, "lng": 19.9455, "url": "https://airbnb.com/…" } }
```

When a booking is confirmed, replace the placeholder lodging and remove `"placeholder": true`.
If you move a city's dates, also move the matching train in `transport.json`, and check `suggestedDate`s in that city's file.

## Adding a new city

1. Add it to `trip.json` → `cities` with `name`, `short` (3 letters), `tz`, `currency`, `color`, `lat`, `lng`, `file`.
2. Create `data/activities/<city>.json` (a JSON array) and fill it with 8–15 ideas.
3. Add or adjust `stays` and the transport in and out of the city.

## Settings (`trip.json` → `settings`)

`dayStart`/`dayEnd` set the awake window used for "free time". `earliest`/`latest` set when to warn. `maxActivityMinutes`
and `minRestMinutes` define an "over-planned" day. `fxToUSD` holds approximate exchange rates for the $ totals.

## Website exports (`data/inbox/`)

On the website, ⋯ → "Download changes" gives a file like:

```json
{ "type": "poland-planner-changes", "exportedBy": "Jane", "overrides": { "krk-wawel": { "status": "yes", "date": "2026-11-26", "start": "10:00" } }, "added": [ { …new idea… } ] }
```

Save it into `data/inbox/` (or take the JSON the user pasted and save it there), then run:

```bash
node scripts/apply-changes.mjs && node scripts/validate.mjs
```

That merges picks and edits into the data files, appends new ideas to their city file, and moves the export to `data/inbox/applied/`.
Afterwards, tell the user they can clear their device's changes (⋯ → Clear) since the changes are now in the shared plan.
