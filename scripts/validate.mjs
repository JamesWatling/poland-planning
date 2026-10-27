#!/usr/bin/env node
// Checks the trip data for mistakes. Run from the repo root: node scripts/validate.mjs
// Exits 1 on errors (CI blocks the deploy); warnings are printed but don't fail.
import { readFileSync } from 'node:fs';
import { createPlanner, tripDays, TRANSPORT, ACTIVITY_TYPES, STATUSES, SCHEDULED } from '../planner.js';

const errors = [], warnings = [];
const read = (p) => {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch (e) { errors.push(`${p}: ${e.message}`); return null; }
};
const DATE = /^\d{4}-\d{2}-\d{2}$/, HM = /^([01]\d|2[0-3]):[0-5]\d$/, LOCAL = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;
const validTz = (tz) => { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; } };

const trip = read('data/trip.json');
if (!trip) finish();

if (!DATE.test(trip.startDate) || !DATE.test(trip.endDate) || trip.startDate > trip.endDate) errors.push('trip.json: startDate/endDate must be YYYY-MM-DD with start ≤ end');
for (const [id, c] of Object.entries(trip.cities)) {
  if (!validTz(c.tz)) errors.push(`city ${id}: invalid tz "${c.tz}"`);
  if (!c.name || !c.color || !c.currency) errors.push(`city ${id}: needs name, color and currency`);
}

// Every night of the trip must be covered by exactly one stay.
for (const s of trip.stays) {
  if (!trip.cities[s.city]) errors.push(`stay ${s.id}: unknown city "${s.city}"`);
  if (!DATE.test(s.checkIn) || !DATE.test(s.checkOut) || s.checkIn >= s.checkOut) errors.push(`stay ${s.id}: checkIn must be before checkOut (YYYY-MM-DD)`);
  if (s.lodging?.placeholder) warnings.push(`stay ${s.id}: lodging is a placeholder (${s.lodging.name})`);
}
for (const d of tripDays(trip)) {
  const n = trip.stays.filter((s) => s.checkIn <= d && d < s.checkOut).length;
  if (d < trip.endDate && n !== 1) errors.push(`night of ${d}: covered by ${n} stays (need exactly 1)`);
}

const files = [trip.transportFile, ...Object.values(trip.cities).map((c) => c.file)].filter(Boolean);
const items = [];
for (const f of files) {
  const list = read(f);
  if (!list) continue;
  if (!Array.isArray(list)) { errors.push(`${f}: must be a JSON array`); continue; }
  for (const it of list) items.push({ ...it, _file: f });
}

const ids = new Set();
const inTrip = (d) => d >= trip.startDate && d <= trip.endDate;
for (const it of items) {
  const where = `${it._file} → ${it.id || it.title || '(no id)'}`;
  if (!it.id) errors.push(`${where}: missing id`);
  else if (ids.has(it.id)) errors.push(`${where}: duplicate id`);
  ids.add(it.id);
  if (!it.title) errors.push(`${where}: missing title`);
  if (!trip.cities[it.city]) errors.push(`${where}: unknown city "${it.city}"`);
  const transport = TRANSPORT.has(it.type);
  if (!transport && !ACTIVITY_TYPES.includes(it.type)) errors.push(`${where}: unknown type "${it.type}"`);
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
  if (it.from?.time || it.to?.time) {
    for (const end of ['from', 'to']) {
      const p = it[end];
      if (!p || !LOCAL.test(p.time || '') || !validTz(p.tz)) errors.push(`${where}: ${end} needs time "YYYY-MM-DDTHH:MM" and a valid tz`);
    }
  } else if (SCHEDULED.has(it.status) && (!it.date || !it.start)) {
    errors.push(`${where}: status "${it.status}" needs a date and start`);
  }
  if (!transport && it.lat == null) warnings.push(`${where}: no lat/lng, so travel time can't be estimated`);
  if (it.placeholder) warnings.push(`${where}: placeholder`);
}

if (!errors.length) {
  const P = createPlanner(trip, items);
  for (const it of items) {
    const t = P.timing(it);
    if (t && t.e <= t.s) errors.push(`${it.id}: ends before it starts (check time zones)`);
  }
  for (const d of tripDays(trip)) for (const w of P.dayInfo(d).warnings) warnings.push(`${d}: ${w}`);
}

finish();

function finish() {
  for (const w of warnings) console.log(`  warn  ${w}`);
  for (const e of errors) console.log(`  ERROR ${e}`);
  console.log(errors.length ? `\n✗ ${errors.length} error(s), ${warnings.length} warning(s)` : `\n✓ Data OK (${items.length} items, ${warnings.length} warning(s))`);
  process.exit(errors.length ? 1 : 0);
}
