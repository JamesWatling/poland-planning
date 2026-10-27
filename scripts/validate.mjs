#!/usr/bin/env node
// Checks the trip data for mistakes. Run from the repo root: node scripts/validate.mjs
// Exits 1 on errors (CI blocks the deploy); warnings are printed but don't fail.
import { createPlanner, tripDays, prefMatch, TRANSPORT, ACTIVITY_TYPES, STATUSES, SCHEDULED, VEGAN, DOG } from '../planner.js';
import { loadAll } from './lib.mjs';

const errors = [], warnings = [];
const DATE = /^\d{4}-\d{2}-\d{2}$/, HM = /^([01]\d|2[0-3]):[0-5]\d$/, LOCAL = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;
const validTz = (tz) => { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; } };

let data;
try { data = loadAll(); } catch (e) { errors.push(e.message); finish(); }
const { trip, cities, routes, route, prefs, transport, activities } = data;

// trip.json
if (!DATE.test(trip.startDate) || !DATE.test(trip.endDate) || trip.startDate > trip.endDate) errors.push('trip.json: startDate/endDate must be YYYY-MM-DD with start ≤ end');
if (!cities[trip.home?.city]) errors.push('trip.json: home.city must be a key in cities.json');
if (!(trip.gateway?.airport || trip.home?.airport)?.code) errors.push('trip.json: gateway.airport (or home.airport) needs code/name/lat/lng');
for (const k of ['toGateway', 'fromGateway']) { const g = trip.gateway?.[k]; if (g && (!LOCAL.test(g.depart || '') || !(g.minutes > 0))) errors.push(`trip.json gateway.${k}: needs depart "YYYY-MM-DDTHH:MM" (home time zone for toGateway, gateway time zone for fromGateway) and minutes`); }

// cities.json
for (const [id, c] of Object.entries(cities)) {
  if (!validTz(c.tz)) errors.push(`cities.json ${id}: invalid tz "${c.tz}"`);
  if (!c.name || !c.color || !c.currency) errors.push(`cities.json ${id}: needs name, color and currency`);
  if (c.kind === 'city') {
    if (typeof c.lat !== 'number' || typeof c.lng !== 'number') errors.push(`cities.json ${id}: needs lat/lng`);
    if (!c.nights?.ideal) warnings.push(`cities.json ${id}: no nights.ideal`);
    if (!c.station) warnings.push(`cities.json ${id}: no station (trains will start at the city centre)`);
    if (!(c.stayAreas || []).length) warnings.push(`cities.json ${id}: no stayAreas`);
  }
}
for (const id of ['transit', 'unplanned']) if (!cities[id]) errors.push(`cities.json: missing the special "${id}" entry`);

// routes.json
for (const r of routes) {
  if (!cities[r.from] || !cities[r.to]) errors.push(`routes.json ${r.from}>${r.to}: unknown city`);
  if (!(r.minutes > 0)) errors.push(`routes.json ${r.from}>${r.to}: minutes must be > 0`);
  if ((prefs.transport?.avoid || []).includes(r.mode)) warnings.push(`routes.json ${r.from}>${r.to}: mode "${r.mode}" is in preferences.transport.avoid`);
}

// route.json
for (const end of ['arrival', 'departure']) {
  const e = route[end];
  if (cities[e?.city]?.kind !== 'city') errors.push(`route.json ${end}.city must be a city in cities.json`);
  if (!LOCAL.test(e?.flight?.depart || '') || !LOCAL.test(e?.flight?.arrive || '')) errors.push(`route.json ${end}.flight needs depart/arrive "YYYY-MM-DDTHH:MM"`);
}
route.stops.forEach((s, i) => {
  if (cities[s.city]?.kind !== 'city') errors.push(`route.json stops[${i}]: unknown city "${s.city}"`);
  if (!(Number.isInteger(s.nights) && s.nights >= 1)) errors.push(`route.json stops[${i}]: nights must be a whole number ≥ 1`);
  if (s.area && !(cities[s.city]?.stayAreas || []).some((a) => a.id === s.area)) warnings.push(`route.json stops[${i}]: area "${s.area}" isn't in ${s.city}'s stayAreas`);
  if (i && route.stops[i - 1].city === s.city) warnings.push(`route.json stops[${i}]: same city twice in a row, so merge them`);
});
for (const p of route.pins || []) if (!DATE.test(p.date) || !cities[p.city]) errors.push(`route.json pin ${JSON.stringify(p)}: needs a date and a known city`);

// preferences.json
for (const k of ['interests', 'avoid', 'flexible']) if (prefs[k] && !Array.isArray(prefs[k])) errors.push(`preferences.json: ${k} must be a list`);
for (const t of prefs.travelers || []) if (!t.name) errors.push('preferences.json: every traveler needs a name');
const vegan = (prefs.travelers || []).some((t) => (t.diet || []).includes('vegan'));

// activities + transport
const ids = new Set();
const inTrip = (d) => d >= trip.startDate && d <= trip.endDate;
for (const it of [...activities, ...transport.map((t) => ({ ...t, _file: 'data/transport.json' }))]) {
  const where = `${it._file} → ${it.id || it.title || '(no id)'}`;
  if (!it.id) errors.push(`${where}: missing id`);
  else if (ids.has(it.id)) errors.push(`${where}: duplicate id`);
  ids.add(it.id);
  if (!it.title) errors.push(`${where}: missing title`);
  if (!cities[it.city]) errors.push(`${where}: unknown city "${it.city}"`);
  const transportItem = TRANSPORT.has(it.type);
  if (!transportItem && !ACTIVITY_TYPES.includes(it.type)) errors.push(`${where}: unknown type "${it.type}"`);
  if (it.status && !STATUSES.includes(it.status)) errors.push(`${where}: unknown status "${it.status}"`);
  if (it.date != null && (!DATE.test(it.date) || !inTrip(it.date))) errors.push(`${where}: date "${it.date}" must be within the trip`);
  if (it.suggestedDate != null && (!DATE.test(it.suggestedDate) || !inTrip(it.suggestedDate))) errors.push(`${where}: suggestedDate "${it.suggestedDate}" must be within the trip`);
  for (const k of ['start', 'suggestedStart']) if (it[k] != null && !HM.test(it[k])) errors.push(`${where}: ${k} must be HH:MM (24h)`);
  if (it.duration != null && !(Number.isInteger(it.duration) && it.duration > 0)) errors.push(`${where}: duration must be whole minutes`);
  if (it.maxDuration != null && it.duration && it.maxDuration < it.duration) warnings.push(`${where}: maxDuration is less than duration`);
  if ((it.lat == null) !== (it.lng == null) || (it.lat != null && (typeof it.lat !== 'number' || typeof it.lng !== 'number'))) errors.push(`${where}: lat/lng must both be numbers`);
  if (it.price != null && (typeof it.price !== 'object' || (it.price.amount != null && typeof it.price.amount !== 'number') || !it.price.currency)) errors.push(`${where}: price must be {"amount": number|null, "currency": "PLN"}`);
  if (it.price?.currency && trip.settings.fxToUSD[it.price.currency] == null) warnings.push(`${where}: no fxToUSD rate for ${it.price.currency}`);
  if (it.hours && (!HM.test(it.hours.open || '') || !HM.test(it.hours.close || ''))) errors.push(`${where}: hours must be {"open":"HH:MM","close":"HH:MM"}`);
  if (it.dog != null && !DOG.includes(it.dog)) errors.push(`${where}: dog must be one of ${DOG.join(', ')}`);
  if ((prefs.pets || []).length && !transportItem && !it.dog) warnings.push(`${where}: no "dog" rating`);
  if (it.vegan != null && !VEGAN.includes(it.vegan)) errors.push(`${where}: vegan must be one of ${VEGAN.join(', ')}`);
  if (it.from?.time || it.to?.time) {
    for (const end of ['from', 'to']) {
      const p = it[end];
      if (!p || !LOCAL.test(p.time || '') || !validTz(p.tz)) errors.push(`${where}: ${end} needs time "YYYY-MM-DDTHH:MM" and a valid tz`);
    }
  } else if (SCHEDULED.has(it.status) && (!it.date || !it.start)) {
    errors.push(`${where}: status "${it.status}" needs a date and start`);
  }
  if (!transportItem && it.lat == null) warnings.push(`${where}: no lat/lng, so travel time can't be estimated`);
  if (vegan && it.type === 'food' && !it.vegan) warnings.push(`${where}: food without a "vegan" rating`);
  if (!transportItem && it.status !== 'no') {
    const pm = prefMatch(it, prefs);
    if (pm.avoid.length) warnings.push(`${where}: matches "avoid" (${pm.avoid.join(', ')}). Mark it "no" or drop it`);
  }
  if (it.placeholder) warnings.push(`${where}: placeholder`);
}

if (!errors.length) {
  const P = createPlanner({ trip, cities, routes, route, prefs, activities, transport });
  for (const w of P.itin.warnings) warnings.push(`route: ${w}`);
  for (const it of P.items) {
    const t = P.timing(it);
    if (t && t.e <= t.s) errors.push(`${it.id}: ends before it starts (check time zones)`);
  }
  const onRoute = new Set(route.stops.map((s) => s.city));
  for (const it of activities) if (it.status === 'yes' && !onRoute.has(it.city)) warnings.push(`${it.id}: scheduled but ${it.city} isn't on the route anymore`);
  for (const id of onRoute) if (!activities.some((a) => a.city === id)) warnings.push(`${id}: on the route but has no ideas yet. Run the research-city skill`);
  for (const s of P.itin.stays) if (s.lodging?.placeholder && cities[s.city]?.kind === 'city') warnings.push(`stay ${s.city} ${s.checkIn}: lodging not booked yet`);
  for (const d of tripDays(trip)) for (const w of P.dayInfo(d).warnings) warnings.push(`${d}: ${w}`);
}

finish();

function finish() {
  for (const w of warnings) console.log(`  warn  ${w}`);
  for (const e of errors) console.log(`  ERROR ${e}`);
  console.log(errors.length ? `\n✗ ${errors.length} error(s), ${warnings.length} warning(s)` : `\n✓ Data OK (${data.activities.length} activities, ${warnings.length} warning(s))`);
  process.exit(errors.length ? 1 : 0);
}
