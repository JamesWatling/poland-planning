---
name: research-logistics
description: Research real travel times and prices between the trip's cities, and accommodation options in the chosen stay areas. Use for "check the trains", "how long is Kraków to Gdańsk", "find Airbnbs", or before booking.
---

Transport:
1. For each consecutive pair of stops in `data/route.json` (plus arrival and departure), look up current PKP Intercity / bus / domestic
   flight options (intercity.pl, rozklad-pkp.pl, flixbus, lot.com). Note typical fastest duration, frequency and price.
2. Update or add the pair in `data/routes.json` (`minutes`, `price`, `notes` with frequency and train type, `approx: true`).
3. Never create bookings. If the user has booked something, add it to `data/transport.json` with the right `role` (see `data/AGENTS.md`).

Accommodation (only when asked):
1. Read `preferences.json` → `lodging` (wants, budget) and each stop's `area` in `route.json`, plus the area descriptions in `cities.json`.
2. Search for options (Airbnb/Booking listings or hotels) in that area for the stop's dates. Present 3–5 per city with price per night,
   why it fits, and the link. Don't write them into the data unless the user picks one.
3. When the user confirms a booking, set that stop's `lodging` in `route.json` (name, address, lat, lng, url) with no `placeholder`.

Finally run `node scripts/validate.mjs` and `node scripts/route.mjs`, and commit if asked.
